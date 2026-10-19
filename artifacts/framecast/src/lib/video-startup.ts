export type VideoStartup = { status: 'waiting' | 'playing' | 'blocked' | 'failed'; message?: string };

// Keep the decoder in the visible layout: some TVs suspend offscreen video.
export function tvVideoPresentation(fit: 'cover' | 'contain') {
  return { objectFit: fit, width: '100%', height: '100%', opacity: 1 };
}

export async function startReceiverVideo(video: Pick<HTMLVideoElement, 'play'>, handlers: {
  onPlaying: () => void;
  onBlocked: () => void;
  onFailed: (error: unknown) => void;
}): Promise<void> {
  try {
    await video.play();
  } catch (error) {
    if ((error as { name?: string })?.name === 'NotAllowedError') handlers.onBlocked();
    else handlers.onFailed(error);
    return;
  }
  handlers.onPlaying();
}

export async function waitForVideoStartup(options: {
  state: () => VideoStartup;
  active: () => boolean;
  now?: () => number;
  delay?: (ms: number) => Promise<void>;
  timeoutMs?: number;
}): Promise<VideoStartup | { status: 'interrupted' }> {
  const now = options.now ?? Date.now;
  const delay = options.delay ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const deadline = now() + (options.timeoutMs ?? 60_000);
  while (options.active()) {
    const state = options.state();
    if (state.status === 'failed') throw new Error(state.message || 'The TV reported a playback error.');
    if (state.status !== 'waiting') return state;
    if (now() >= deadline) throw new Error('The TV has not confirmed playback after one minute. Check the TV screen for a Play prompt, then try again. This does not necessarily mean the video format is unsupported.');
    await delay(150);
  }
  return { status: 'interrupted' };
}
