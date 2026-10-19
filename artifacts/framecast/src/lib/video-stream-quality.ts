export type VideoStreamProfile = {
  width: number;
  height: number;
  frameRate: number;
  maxBitrate: number;
};

/** Bound phone work to Full HD; a 4K file must not require a 4K canvas encoder. */
export function phoneStreamProfile(width: number, height: number): VideoStreamProfile {
  const fullHd = width * height >= 1920 * 1080;
  return {
    width: fullHd ? 1920 : 1280,
    height: fullHd ? 1080 : 720,
    frameRate: 30,
    maxBitrate: fullHd ? 8_000_000 : 4_000_000,
  };
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
