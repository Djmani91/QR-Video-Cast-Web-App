/** Pairing outlives an individual WebRTC connection. Never run two repairs. */
export function createSessionRecovery(options: {
  active: () => boolean;
  visible: () => boolean;
  healthy: () => Promise<boolean>;
  recover: () => Promise<void>;
  onError?: (error: unknown) => void;
}, clock = {
  setTimeout: (callback: () => void, delay: number) => globalThis.setTimeout(callback, delay),
  clearTimeout: (timer: ReturnType<typeof setTimeout>) => globalThis.clearTimeout(timer),
}) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let busy = false;
  let disposed = false;
  let generation = 0;
  const eligible = () => !disposed && options.active() && options.visible();
  function cancel() {
    generation += 1;
    if (timer !== null) clock.clearTimeout(timer);
    timer = null;
  }
  function schedule(delay = 5000) {
    if (timer !== null) clock.clearTimeout(timer);
    timer = null;
    if (eligible()) timer = clock.setTimeout(() => { timer = null; void check(); }, delay);
  }
  async function check() {
    if (busy || !eligible()) return;
    const run = generation;
    busy = true;
    try {
      const healthy = await options.healthy();
      if (!healthy && run === generation && eligible()) await options.recover();
    } catch (error) {
      if (run === generation && eligible()) options.onError?.(error);
    } finally {
      busy = false;
      schedule();
    }
  }
  return {
    wake: () => schedule(0),
    cancel,
    check,
    dispose() { disposed = true; cancel(); },
  };
}

/** Test the existing peer, not merely a possibly stale connectionState flag. */
export function createPeerProbe() {
  let pending: { nonce: string; finish: (alive: boolean) => void } | null = null;
  return {
    check(channel: Pick<RTCDataChannel, 'readyState' | 'send'> | null, timeoutMs = 2000): Promise<boolean> {
      pending?.finish(false);
      if (channel?.readyState !== 'open') return Promise.resolve(false);
      return new Promise((resolve) => {
        const nonce = crypto.randomUUID();
        const finish = (alive: boolean) => {
          if (pending?.nonce !== nonce) return;
          clearTimeout(timer);
          pending = null;
          resolve(alive);
        };
        const timer = setTimeout(() => finish(false), timeoutMs);
        pending = { nonce, finish };
        try { channel.send(JSON.stringify({ framecast: 'session-probe', nonce })); }
        catch { finish(false); }
      });
    },
    accept(nonce: unknown) { if (nonce === pending?.nonce) pending?.finish(true); },
    cancel() { pending?.finish(false); },
  };
}

export type ScopedIceCandidate = RTCIceCandidateInit & { sessionId?: string };
export const matchesSession = (received: unknown, current: string | null) => !received || received === current;

export function peerIsOpening(state: string | undefined, mediaState: string | undefined, controlState: string | undefined, ageMs: number) {
  return ageMs < 20_000 && (state === 'new' || state === 'connecting'
    || (state === 'connected' && (mediaState === 'connecting' || controlState === 'connecting')));
}
