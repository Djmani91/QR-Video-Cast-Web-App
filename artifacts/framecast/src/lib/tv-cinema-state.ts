export function shouldShowTvCinema({
  roomLive, paired, launchedFromPhone, status, hasActiveMedia, waitingForPlayback, switchingVideo,
}: {
  roomLive: boolean;
  paired: boolean;
  launchedFromPhone: boolean;
  status: string;
  hasActiveMedia: boolean;
  waitingForPlayback: boolean;
  switchingVideo: boolean;
}): boolean {
  return roomLive && (switchingVideo
    || ((paired || launchedFromPhone || status !== 'idle') && (waitingForPlayback || !hasActiveMedia)));
}
