export const MAX_MEDIA_SELECTION_ITEMS = 20;

export function getRemainingMediaSelectionSlots(unlocked: boolean, existingItems: number): number {
  const limit = unlocked ? MAX_MEDIA_SELECTION_ITEMS : 1;
  const count = Number.isFinite(existingItems) ? Math.max(0, Math.floor(existingItems)) : 0;
  return Math.max(0, limit - count);
}
