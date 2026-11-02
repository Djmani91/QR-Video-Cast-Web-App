export const FREE_CASTING_TRIAL_DURATION_MS = 30 * 60 * 1000;

export type FreeCastingTrialRecord = {
  hasStarted: boolean;
  remainingMs: number;
};

export function createFreeCastingTrialRecord(): FreeCastingTrialRecord {
  return { hasStarted: false, remainingMs: FREE_CASTING_TRIAL_DURATION_MS };
}

export function parseFreeCastingTrialRecord(value: string | null): FreeCastingTrialRecord | null {
  if (value === null) return createFreeCastingTrialRecord();
  try {
    const parsed = JSON.parse(value) as Partial<FreeCastingTrialRecord>;
    if (typeof parsed.hasStarted !== 'boolean' || !Number.isFinite(parsed.remainingMs)) return null;
    return {
      hasStarted: parsed.hasStarted,
      remainingMs: Math.max(0, Math.min(FREE_CASTING_TRIAL_DURATION_MS, Math.floor(parsed.remainingMs!))),
    };
  } catch {
    return null;
  }
}

export function remainingFreeCastingTrialMs(
  record: FreeCastingTrialRecord,
  activeSince: number | null,
  now: number,
): number {
  if (activeSince === null) return record.remainingMs;
  return Math.max(0, record.remainingMs - Math.max(0, now - activeSince));
}

export function formatFreeCastingTrialTime(milliseconds: number): string {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
