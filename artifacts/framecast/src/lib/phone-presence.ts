/** A fresh challenge response, not saved pairing/history, proves phone presence. */
export function createPhonePresence(now = Date.now) {
  const challenge = `${now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const started = now();
  let lastReply: number | null = null;
  return {
    challenge,
    acknowledge(value: unknown) {
      if (value !== challenge) return false;
      lastReply = now();
      return true;
    },
    status(): 'checking' | 'online' | 'away' {
      return lastReply === null ? now() - started < 45_000 ? 'checking' : 'away'
        : now() - lastReply < 45_000 ? 'online' : 'away';
    },
  };
}
