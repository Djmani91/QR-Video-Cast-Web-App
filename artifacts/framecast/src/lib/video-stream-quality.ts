export type VideoStreamProfile = {
  width: number;
  height: number;
  frameRate: number;
  maxBitrate: number;
};

export const VIDEO_QUALITY_HEIGHTS = [540, 720, 1080, 1440, 2160] as const;

/** Higher tiers are opt-in ceilings selected by the health monitor, not by file
 * size alone. Never manufacture UHD from a lower-resolution source.
 */
export function phoneStreamProfile(width: number, height: number, ceiling = 1080): VideoStreamProfile {
  const pixels = Math.max(0, width) * Math.max(0, height);
  const tier = ceiling >= 2160 && pixels >= 3840 * 2160 ? 2160
    : ceiling >= 1440 && pixels >= 2560 * 1440 ? 1440
    : ceiling >= 1080 && pixels >= 1920 * 1080 ? 1080
    : ceiling < 720 ? 540 : 720;
  return {
    width: { 540: 960, 720: 1280, 1080: 1920, 1440: 2560, 2160: 3840 }[tier],
    height: tier,
    frameRate: 30,
    maxBitrate: { 540: 1_500_000, 720: 3_000_000, 1080: 6_000_000, 1440: 10_000_000, 2160: 20_000_000 }[tier],
  };
}

/** Prefer commonly hardware-accelerated TV codecs, retaining all negotiated
 * fallbacks. This is a preference, not a promise of hardware acceleration.
 */
export function preferHardwareVideoCodec(peer: Pick<RTCPeerConnection, 'getTransceivers'>,
  codecs = globalThis.RTCRtpSender?.getCapabilities?.('video')?.codecs ?? []): boolean {
  if (!codecs.some(codec => codec.mimeType.toLowerCase() === 'video/h264')) return false;
  const rank = (mime: string) => mime.toLowerCase() === 'video/h264' ? 0 : mime.toLowerCase() === 'video/vp8' ? 1 : 2;
  const ordered = [...codecs].sort((a, b) => rank(a.mimeType) - rank(b.mimeType));
  let configured = false;
  for (const transceiver of peer.getTransceivers()) {
    if (transceiver.sender.track?.kind !== 'video' || !transceiver.setCodecPreferences) continue;
    transceiver.setCodecPreferences(ordered);
    configured = true;
  }
  return configured;
}

/** Keep congestion control active, but do not let a generic low bitrate cap HD.
 * Prefer reducing resolution over freezing motion when the phone/Wi-Fi is busy.
 */
export async function configureVideoSender(sender: RTCRtpSender, profile: VideoStreamProfile): Promise<boolean> {
  const parameters = sender.getParameters();
  if (!parameters.encodings?.length) return false; // Some browsers need SDP first.
  for (const encoding of parameters.encodings) {
    encoding.maxBitrate = profile.maxBitrate;
    encoding.maxFramerate = profile.frameRate;
    encoding.scaleResolutionDownBy = 1;
  }
  parameters.degradationPreference = 'maintain-framerate';
  await sender.setParameters(parameters);
  return true;
}
