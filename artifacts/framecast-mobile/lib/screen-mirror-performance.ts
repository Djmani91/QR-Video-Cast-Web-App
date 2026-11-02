type ScreenSenderEncoding = {
  active?: boolean;
  maxBitrate?: number;
  maxFramerate?: number;
  scaleResolutionDownBy?: number;
};
type ScreenSenderParameters = {
  encodings?: ScreenSenderEncoding[];
  degradationPreference?: string | null;
};
export type ScreenSenderLike = {
  getParameters(): ScreenSenderParameters;
  setParameters(parameters: ScreenSenderParameters): Promise<void>;
};

export async function configureLowLatencyScreenSender(
  sender: ScreenSenderLike,
  track: { getSettings?: () => { width?: number; height?: number; frameRate?: number } },
) {
  const parameters = sender.getParameters();
  const encoding = parameters.encodings?.[0];
  if (!encoding) return;

  const settings = track.getSettings?.();
  const longestSide = Math.max(settings?.width ?? 0, settings?.height ?? 0);
  encoding.maxFramerate = 30;
  // A ceiling, not a forced rate: WebRTC congestion control can still reduce it.
  // More headroom preserves text/detail without raising resolution or frame rate.
  encoding.maxBitrate = 4_500_000;
  encoding.scaleResolutionDownBy = longestSide > 1280 ? longestSide / 1280 : 1;
  parameters.degradationPreference = 'maintain-framerate';
  await sender.setParameters(parameters);
}
