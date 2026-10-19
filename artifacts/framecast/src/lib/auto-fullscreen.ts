type Attempt = {
  ready: () => boolean;
  request: () => Promise<boolean>;
  onResult: (entered: boolean) => void;
};

/** Retry initial decoder readiness, not forever and not after the viewer's Back. */
export function createAutoFullscreen(clock = { setTimeout, clearTimeout }) {
  let source: unknown = null;
  let generation = 0;
  let count = 0;
  let busy = false;
  let entered = false;
  let dismissed = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const cancelTimer = () => {
    if (timer !== null) clock.clearTimeout(timer);
    timer = null;
  };
  const reset = (nextSource: unknown = null) => {
    cancelTimer();
    generation++;
    source = nextSource;
    count = 0;
    busy = entered = dismissed = false;
  };
  async function start(nextSource: unknown, options: Attempt): Promise<void> {
    if (source !== nextSource) reset(nextSource);
    if (!source || busy || entered || dismissed || count >= 3 || !options.ready()) return;
    cancelTimer();
    const run = generation;
    busy = true;
    count++;
    let result = false;
    try { result = await options.request(); } catch { /* The visible TV/phone fallback reports denial. */ }
    if (run !== generation || dismissed) return;
    busy = false;
    entered = result;
    options.onResult(result);
    if (!result && count < 3) {
      timer = clock.setTimeout(() => {
        timer = null;
        if (run === generation) void start(nextSource, options);
      }, count * 500);
    }
  }
  return {
    start, reset,
    allow(nextSource: unknown) { reset(nextSource); },
    dismiss(nextSource: unknown) { reset(nextSource); dismissed = true; },
    observe(fullscreen: boolean) {
      if (fullscreen) { entered = true; cancelTimer(); }
      else if (entered) { dismissed = true; cancelTimer(); }
    },
  };
}
