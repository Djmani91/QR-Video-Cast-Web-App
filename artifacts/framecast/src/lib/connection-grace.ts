export const CONNECTION_GRACE_MS = 60_000;

/** Keep one recovery window per interruption; repeated events cannot extend it. */
export function createConnectionGrace(clock = {
  setTimeout: (callback: () => void, delay: number) => globalThis.setTimeout(callback, delay),
  clearTimeout: (timer: ReturnType<typeof setTimeout>) => globalThis.clearTimeout(timer),
}) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let expired = false;
  return {
    get pending() { return timer !== null; },
    get interrupted() { return timer !== null || expired; },
    hold(onExpired: () => void) {
      if (timer !== null || expired) return;
      timer = clock.setTimeout(() => {
        timer = null;
        expired = true;
        onExpired();
      }, CONNECTION_GRACE_MS);
    },
    cancel() {
      if (timer !== null) clock.clearTimeout(timer);
      timer = null;
      expired = false;
    },
  };
}
