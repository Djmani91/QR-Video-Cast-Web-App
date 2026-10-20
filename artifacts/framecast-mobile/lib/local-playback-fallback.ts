export const LOCAL_PLAYBACK_FALLBACK_TIMEOUT_MS = 10_000;
export const BUFFERED_VIDEO_FALLBACK_MAX_BYTES = 128 * 1024 * 1024;

export function shouldUseBufferedVideoFallback(fileSize: number): boolean {
  return Number.isFinite(fileSize)
    && fileSize > 0
    && fileSize <= BUFFERED_VIDEO_FALLBACK_MAX_BYTES;
}
