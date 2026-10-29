export function shouldShowPairingInterstitial(roomId: string, lastShownRoomId: string): boolean {
  return roomId.length > 0 && roomId !== lastShownRoomId;
}

export const VIDEO_BREAK_AD_MIN_COMPLETED_VIDEOS = 2;
export const VIDEO_BREAK_AD_COOLDOWN_MS = 5 * 60 * 1000;

export function shouldAttemptBetweenVideoInterstitial(
  completedVideosSinceAd: number,
  lastAdAttemptAtMs: number | null,
  nowMs: number,
): boolean {
  if (completedVideosSinceAd < VIDEO_BREAK_AD_MIN_COMPLETED_VIDEOS) return false;
  if (lastAdAttemptAtMs === null) return true;
  return nowMs - lastAdAttemptAtMs >= VIDEO_BREAK_AD_COOLDOWN_MS;
}
