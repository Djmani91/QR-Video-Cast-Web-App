export const MAX_MEDIA_SELECTION_ITEMS = 20;
export const REWARDED_MEDIA_SELECTION_LIMIT = 2;

export function getRemainingMediaSelectionSlots(unlocked: boolean, existingItems: number): number {
  const limit = unlocked ? REWARDED_MEDIA_SELECTION_LIMIT : 1;
  const count = Number.isFinite(existingItems) ? Math.max(0, Math.floor(existingItems)) : 0;
  return Math.max(0, limit - count);
}

export function getRemainingPremiumMediaSelectionSlots(existingItems: number): number {
  const count = Number.isFinite(existingItems) ? Math.max(0, Math.floor(existingItems)) : 0;
  return Math.max(0, MAX_MEDIA_SELECTION_ITEMS - count);
}
