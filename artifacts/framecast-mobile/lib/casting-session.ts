export const FREE_CASTING_DURATION_MS = 60 * 60 * 1000;
export const REWARDED_CASTING_EXTENSION_MS = 60 * 60 * 1000;

export function startCastingDeadline(now: number): number {
  return now + FREE_CASTING_DURATION_MS;
}

export function extendCastingDeadline(deadline: number, now: number): number {
  return Math.max(deadline, now) + REWARDED_CASTING_EXTENSION_MS;
}

export function getCastingTimeRemaining(deadline: number, now: number): number {
  return Math.max(0, deadline - now);
}

export function formatCastingTime(milliseconds: number): string {
  const totalSeconds = Math.ceil(Math.max(0, milliseconds) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value: number) => String(value).padStart(2, '0');

  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${minutes}:${pad(seconds)}`;
}
