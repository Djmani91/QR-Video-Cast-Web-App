export function shouldShowPairingInterstitial(roomId: string, lastShownRoomId: string): boolean {
  return roomId.length > 0 && roomId !== lastShownRoomId;
}
