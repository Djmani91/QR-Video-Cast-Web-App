export type VideoStreamProfile = {
  width: number;
  height: number;
  frameRate: number;
  maxBitrate: number;
};

/** Bound phone work to Full HD; a 4K file must not require a 4K canvas encoder. */
export function phoneStreamProfile(width: number, height: number, ceiling = 1080): VideoStreamProfile {
  const fullHd = width * height >= 1920 * 1080 && ceiling >= 1080;
  const compact = ceiling < 720;
  return {
    width: fullHd ? 1920 : compact ? 960 : 1280,
    height: fullHd ? 1080 : compact ? 540 : 720,
    frameRate: 30,
    maxBitrate: fullHd ? 6_000_000 : compact ? 1_500_000 : 3_000_000,
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
