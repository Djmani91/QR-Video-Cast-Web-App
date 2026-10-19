type RendererOptions = {
  rotation: number;
  fitMode?: 'cover' | 'contain';
  encodedWidth?: number;
  encodedHeight?: number;
  onError: (message: string) => void;
  scheduleFrame?: (callback: FrameRequestCallback) => number;
  cancelFrame?: (handle: number) => void;
};

export function needsVideoCanvas(rotation: number, fitMode: 'cover' | 'contain', width: number, height: number, viewportWidth: number, viewportHeight: number): boolean {
  if (rotation) return true;
  if (fitMode === 'contain' || !width || !height || !viewportWidth || !viewportHeight) return false;
  return Math.abs((width / height) / (viewportWidth / viewportHeight) - 1) > 0.01;
}

/**
 * Rotate decoded pixels, not the hardware-backed <video> element. Some TV
 * compositors ignore video CSS transforms even though laptops apply them.
 * Frames stay in TV memory; no recording, conversion queue or upload is used.
 */
export function startRotatedVideoCanvas(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  options: RendererOptions,
): () => void {
  const maybeContext = canvas.getContext('2d', { alpha: false });
  if (!maybeContext) {
    options.onError('This TV browser cannot draw the corrected video picture.');
    return () => {};
  }
  const context: CanvasRenderingContext2D = maybeContext;
  const rotation = ((Math.round(options.rotation / 90) * 90) % 360 + 360) % 360;
  const scheduleFrame = options.scheduleFrame ?? ((callback) => window.requestAnimationFrame(callback));
  const cancelFrame = options.cancelFrame ?? ((handle) => window.cancelAnimationFrame(handle));
  const nativeFrameCallbacks = typeof video.requestVideoFrameCallback === 'function'
    && typeof video.cancelVideoFrameCallback === 'function';
  let stopped = false;
  let handle: number | null = null;
  let lastDraw = -Infinity;
  let lastMediaTime = NaN;
  let failedDraws = 0;

  function stop() {
    if (stopped) return;
    stopped = true;
    if (handle !== null) {
      if (nativeFrameCallbacks) video.cancelVideoFrameCallback(handle);
      else cancelFrame(handle);
    }
    for (const event of ['loadeddata', 'seeked', 'resize']) video.removeEventListener(event, drawImmediately);
    canvas.ownerDocument?.defaultView?.removeEventListener('resize', drawImmediately);
    canvas.ownerDocument?.removeEventListener('fullscreenchange', drawImmediately);
    canvas.ownerDocument?.removeEventListener('webkitfullscreenchange', drawImmediately);
    canvas.width = 0;
    canvas.height = 0;
  }

  function paint(now: number, force = false) {
    if (stopped || video.readyState < 2) return;
    if (!force && (now - lastDraw < 1000 / 30 - 1 || (video.paused && video.currentTime === lastMediaTime))) return;
    const width = video.videoWidth || options.encodedWidth || 0;
    const height = video.videoHeight || options.encodedHeight || 0;
    if (!width || !height) return;
    // Bound a single frame's memory/TV processing cost without buffering a film.
    const quarterTurn = rotation === 90 || rotation === 270;
    const uprightWidth = quarterTurn ? height : width;
    const uprightHeight = quarterTurn ? width : height;
    const cover = options.fitMode === 'cover';
    const targetWidth = cover ? canvas.parentElement?.clientWidth || 1920 : uprightWidth;
    const targetHeight = cover ? canvas.parentElement?.clientHeight || 1080 : uprightHeight;
    const outputScale = Math.min(1, 1920 / Math.max(targetWidth, targetHeight));
    const outputWidth = Math.max(1, Math.round(targetWidth * outputScale));
    const outputHeight = Math.max(1, Math.round(targetHeight * outputScale));
    const scale = cover ? Math.max(outputWidth / uprightWidth, outputHeight / uprightHeight) : outputScale;
    const drawnWidth = width * scale;
    const drawnHeight = height * scale;
    if (canvas.width !== outputWidth) canvas.width = outputWidth;
    if (canvas.height !== outputHeight) canvas.height = outputHeight;
    context.save();
    try {
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.translate(canvas.width / 2, canvas.height / 2);
      context.rotate(rotation * Math.PI / 180);
      context.drawImage(video, -drawnWidth / 2, -drawnHeight / 2, drawnWidth, drawnHeight);
      failedDraws = 0;
      lastDraw = now;
      lastMediaTime = video.currentTime;
    } catch (error) {
      failedDraws += 1;
      if ((error as { name?: string })?.name !== 'InvalidStateError' || failedDraws >= 30) {
        stop();
        options.onError('This TV browser could not draw the corrected video frames. Its video drawing mode may not be supported.');
      }
    } finally {
      context.restore();
    }
  }

  function drawImmediately() { paint(performance.now(), true); }
  function next(now: number) {
    if (stopped) return;
    paint(now);
    schedule();
  }
  function schedule() {
    if (stopped) return;
    handle = nativeFrameCallbacks
      ? video.requestVideoFrameCallback((now) => next(now))
      : scheduleFrame(next);
  }
  for (const event of ['loadeddata', 'seeked', 'resize']) video.addEventListener(event, drawImmediately);
  canvas.ownerDocument?.defaultView?.addEventListener('resize', drawImmediately);
  canvas.ownerDocument?.addEventListener('fullscreenchange', drawImmediately);
  canvas.ownerDocument?.addEventListener('webkitfullscreenchange', drawImmediately);
  paint(0, true);
  schedule();
  return stop;
}
