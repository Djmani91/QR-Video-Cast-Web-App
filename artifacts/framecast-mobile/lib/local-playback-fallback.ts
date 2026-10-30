// Samsung TV browsers can take several seconds to follow the phone-hosted
// receiver URL, especially during a video switch. Keep the server alive until
// the TV has a chance to send its first player-state acknowledgement.
export const LOCAL_PLAYBACK_FALLBACK_TIMEOUT_MS = 15_000;
export const BUFFERED_VIDEO_FALLBACK_MAX_BYTES = 128 * 1024 * 1024;

export function shouldUseBufferedVideoFallback(fileSize: number): boolean {
  return Number.isFinite(fileSize)
    && fileSize > 0
    && fileSize <= BUFFERED_VIDEO_FALLBACK_MAX_BYTES;
}
