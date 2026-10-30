export type VideoQueueEntry = { kind: string };

export function findAdjacentVideoIndex(
  items: readonly VideoQueueEntry[],
  currentIndex: number,
  direction: -1 | 1,
): number | null {
  for (
    let index = currentIndex + direction;
    index >= 0 && index < items.length;
    index += direction
  ) {
    if (items[index]?.kind === 'video') return index;
  }
  return null;
}
