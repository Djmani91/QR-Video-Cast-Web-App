export const MAX_PLAYLIST_ITEMS = 30;

export function movePlaylistItem<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items];
  if (from < 0 || from >= next.length || to < 0 || to >= next.length || !Number.isInteger(from) || !Number.isInteger(to)) return next;
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function playlistNeighbour(length: number, current: number, direction: -1 | 1): number | null {
  const next = current + direction;
  return current >= 0 && current < length && next >= 0 && next < length ? next : null;
}
