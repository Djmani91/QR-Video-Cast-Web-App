/** This is an app courtesy allowance, not a fabricated AdMob earned reward. */
export function shouldUnlockExtraMedia(result: string) {
  return result === 'earned' || result === 'no-fill' || result === 'unavailable';
}

export function isRewardedNoFill(error: { code?: unknown; reason?: unknown }) {
  return [error.code, error.reason].some(value => value === 3 || value === '3'
    || typeof value === 'string' && (value === 'no-fill' || value === 'mediation-no-fill'
      || value.endsWith('/no-fill') || value.endsWith('/mediation-no-fill')));
}
