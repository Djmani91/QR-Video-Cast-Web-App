type LiveReceiver = {
  jitterBufferTarget?: number | null;
  playoutDelayHint?: number | null;
};

/** Optional per-receiver hints. Ordinary movie playback must keep its buffering. */
export function configureScreenMirrorReceiver(receiver: LiveReceiver): boolean {
  let configured = false;
  // Keep a small jitter cushion rather than requesting zero buffering, which
  // can turn normal Wi-Fi packet variation into visible stutter.
  if ('jitterBufferTarget' in receiver) {
    try {
      receiver.jitterBufferTarget = 50; // milliseconds, not seconds
      configured = true;
    } catch {
      // Older TV engines may expose the property without a supported setter.
    }
  }
  if ('playoutDelayHint' in receiver) {
    try {
      receiver.playoutDelayHint = 0.05; // legacy Chromium hint is in seconds
      configured = true;
    } catch {
      // Browser-controlled adaptive buffering remains available.
    }
  }
  return configured;
}
