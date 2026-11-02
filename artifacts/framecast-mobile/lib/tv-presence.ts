export const TV_CONNECTION_CHECK = 'Checking the TV connection. Please wait for the TV to respond before playing media.';

/** Only fresh replies to this connection's challenge prove the receiver is alive. */
export function createTvPresence(now: () => number = Date.now) {
  const challenge = `${now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  let lastReply = now();
  let confirmed = false;
  return {
    challenge,
    acknowledge(value: unknown) {
      if (value !== challenge) return false;
      lastReply = now();
      confirmed = true;
      return true;
    },
    resume() {
      if (confirmed && now() - lastReply < 12_000) return;
      lastReply = now();
      confirmed = false;
    },
    status(): 'checking' | 'online' | 'reconnecting' | 'lost' {
      const age = now() - lastReply;
      if (age >= 45_000) return 'lost';
      if (age >= 12_000) return 'reconnecting';
      return confirmed ? 'online' : 'checking';
    },
  };
}
