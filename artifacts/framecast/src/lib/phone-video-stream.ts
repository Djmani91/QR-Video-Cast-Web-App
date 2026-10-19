import { phoneStreamProfile } from './video-stream-quality.ts';

export type PhoneVideoState = {
  currentTime: number;
  duration: number;
  paused: boolean;
  ended: boolean;
  rotation: number;
  fitMode: 'cover' | 'contain';
};

export type PhoneAudioGraph = {
  video: HTMLVideoElement;
  context: AudioContext;
  source: MediaElementAudioSourceNode;
};

export function waitForPhoneVideoFrame(video: HTMLVideoElement, priming: Promise<unknown>, signal: AbortSignal, timeoutMs = 12_000): Promise<void> {
  return new Promise((resolve, reject) => {
    let primed = false;
    let finished = false;
    const cleanup = () => {
      clearTimeout(timer);
      for (const event of ['loadeddata', 'resize', 'playing']) video.removeEventListener(event, check);
      video.removeEventListener('error', onError);
      signal.removeEventListener('abort', onAbort);
    };
    const finish = (error?: unknown) => {
      if (finished) return;
      finished = true;
      cleanup();
      if (error) reject(error); else resolve();
    };
    const check = () => {
      if (primed && video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) finish();
    };
    const onError = () => finish(new Error(
      video.error?.code === 3 || video.error?.code === 4
        ? 'This phone browser could not decode the video. Try the original video in your phone gallery or a format your phone browser can play.'
        : 'The phone could not read this video. Download the original onto this phone, then select it again.',
    ));
    const onAbort = () => finish(new DOMException('Video startup cancelled.', 'AbortError'));
    const timer = setTimeout(() => finish(new Error('The phone is still waiting for the first video frame. If this is a cloud-only video, download it onto the phone first, then select it again. No video has been uploaded.')), timeoutMs);
    for (const event of ['loadeddata', 'resize', 'playing']) video.addEventListener(event, check);
    video.addEventListener('error', onError);
    signal.addEventListener('abort', onAbort);
    if (signal.aborted) onAbort();
    else if (video.error) onError();
    void priming.then(() => { primed = true; check(); }, (error) => {
      if ((error as { name?: string })?.name === 'NotAllowedError') {
        finish(new Error('The phone browser blocked playback. Tap Play in the phone preview, then try casting again.'));
      } else finish(error);
    });
  });
}

export function createPhoneAudioGraph(video: HTMLVideoElement): PhoneAudioGraph {
  if (typeof document.createElement('canvas').captureStream !== 'function') {
    throw new Error('This phone browser cannot send an upright video stream. Please use a current Chrome or Safari browser.');
  }
  const Context = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Context) throw new Error('This phone browser cannot send corrected video with sound. Use a current Chrome or Safari browser.');
  const context = new Context();
  return { video, context, source: context.createMediaElementSource(video) };
}

export function phoneFrameGeometry(width: number, height: number, rotation: number, fit: 'cover' | 'contain', outputWidth = 1280, outputHeight = 720) {
  const normalized = ((Math.round(rotation / 90) * 90) % 360 + 360) % 360;
  const swapped = normalized === 90 || normalized === 270;
  const uprightWidth = swapped ? height : width;
  const uprightHeight = swapped ? width : height;
  const scale = (fit === 'cover' ? Math.max : Math.min)(outputWidth / uprightWidth, outputHeight / uprightHeight);
  return { rotation: normalized, width: width * scale, height: height * scale };
}

/** Decode only the current frame on the phone; send ordinary WebRTC video/audio.
 * No TV canvas, recording, whole-film conversion, or server media upload.
 */
export function startPhoneVideoStream(video: HTMLVideoElement, graph: PhoneAudioGraph, options: {
  previewMuted: boolean;
  onState: (state: PhoneVideoState) => void;
  onError: (message: string) => void;
}) {
  const canvas = document.createElement('canvas');
  let profile = phoneStreamProfile(video.videoWidth, video.videoHeight);
  canvas.width = profile.width;
  canvas.height = profile.height;
  if (typeof canvas.captureStream !== 'function') throw new Error('This phone browser cannot send an upright video stream. Please use a current Chrome or Safari browser.');
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('This phone browser could not open its video correction engine.');
  const output = canvas.captureStream(profile.frameRate);
  for (const track of output.getVideoTracks?.() ?? []) {
    if ('contentHint' in track) track.contentHint = 'motion';
  }
  const destination = graph.context.createMediaStreamDestination();
  const monitor = graph.context.createGain();
  monitor.gain.value = options.previewMuted ? 0 : 1;
  graph.source.disconnect();
  graph.source.connect(destination);
  graph.source.connect(monitor);
  monitor.connect(graph.context.destination);
  for (const track of destination.stream.getAudioTracks()) output.addTrack(track);
  // Audio goes to the TV destination and optional monitor, not via element mute.
  video.muted = false;
  video.volume = 1;
  video.playsInline = true;
  let stopped = false;
  const startupAbort = new AbortController();
  let sourceLoadAbort: AbortController | null = null;
  let drawingGeneration = 0;
  let rotation = 0;
  let fitMode: 'cover' | 'contain' = 'cover';
  let frame = 0;
  let decoderFrame = 0;
  const decoderClock = typeof video.requestVideoFrameCallback === 'function'
    && typeof video.cancelVideoFrameCallback === 'function';
  let lastDraw = -Infinity;
  let lastState = -Infinity;
  const state = (): PhoneVideoState => ({
    currentTime: Number.isFinite(video.currentTime) ? video.currentTime : 0,
    duration: Number.isFinite(video.duration) ? video.duration : 0,
    paused: video.paused, ended: video.ended, rotation, fitMode,
  });
  function emit() { if (!stopped) options.onState(state()); }
  function paint() {
    if (stopped || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return;
    profile = phoneStreamProfile(video.videoWidth, video.videoHeight);
    if (canvas.width !== profile.width || canvas.height !== profile.height) {
      canvas.width = profile.width;
      canvas.height = profile.height;
    }
    const geometry = phoneFrameGeometry(video.videoWidth, video.videoHeight, rotation, fitMode, canvas.width, canvas.height);
    context!.save();
    try {
      context!.setTransform(1, 0, 0, 1, 0, 0);
      context!.fillStyle = '#000';
      context!.fillRect(0, 0, canvas.width, canvas.height);
      context!.translate(canvas.width / 2, canvas.height / 2);
      context!.rotate(geometry.rotation * Math.PI / 180);
      context!.drawImage(video, -geometry.width / 2, -geometry.height / 2, geometry.width, geometry.height);
    } catch {
      stop();
      options.onError('The phone could not draw this video. Re-select the original file and try again.');
    } finally {
      context!.restore();
    }
  }
  function tick(now: number) {
    if (stopped) return;
    const generation = drawingGeneration;
    const interval = 1000 / profile.frameRate;
    if (!video.paused && !video.ended && now - lastDraw >= interval - 0.5) {
      paint();
      // Preserve the clock's phase: resetting to `now` turned a 24fps target
      // into ~20fps on a 60Hz phone, causing uneven repeated/skipped frames.
      const elapsed = now - lastDraw;
      lastDraw = Number.isFinite(elapsed)
        ? lastDraw + Math.max(1, Math.floor((elapsed + 0.5) / interval)) * interval
        : now;
    }
    if (now - lastState >= 500) { emit(); lastState = now; }
    if (generation === drawingGeneration) schedule();
  }
  function schedule() {
    if (stopped) return;
    const generation = drawingGeneration;
    const callback = (now: number) => {
      if (generation === drawingGeneration) tick(now);
    };
    // Draw actual decoded pictures rather than racing a second display timer.
    if (decoderClock) decoderFrame = video.requestVideoFrameCallback(callback);
    else frame = requestAnimationFrame(callback);
  }
  function redraw() { paint(); emit(); }
  const events = ['seeked', 'loadeddata', 'play', 'pause', 'ended'];
  for (const event of events) video.addEventListener(event, redraw);
  function stop() {
    if (stopped) return;
    stopped = true;
    startupAbort.abort();
    sourceLoadAbort?.abort();
    cancelAnimationFrame(frame);
    if (decoderClock) video.cancelVideoFrameCallback(decoderFrame);
    for (const event of events) video.removeEventListener(event, redraw);
    video.pause();
    graph.source.disconnect();
    graph.source.connect(graph.context.destination);
    monitor.disconnect();
    for (const track of output.getTracks()) track.stop();
    void graph.context.suspend().catch(() => {});
    canvas.width = 0;
    canvas.height = 0;
  }
  // Both calls begin in the phone's button gesture, before network/file awaits.
  const ready = waitForPhoneVideoFrame(video, Promise.all([graph.context.resume(), video.play()]), startupAbort.signal).then(() => {
    if (stopped) return;
    video.pause();
    video.currentTime = 0;
    paint();
    emit();
  });
  schedule();
  return {
    stream: output, ready, state, stop, profile: () => ({ ...profile }),
    async replaceVideo(url: string) {
      if (stopped) return;
      sourceLoadAbort?.abort();
      const abort = new AbortController();
      sourceLoadAbort = abort;
      drawingGeneration++;
      cancelAnimationFrame(frame);
      if (decoderClock) video.cancelVideoFrameCallback(decoderFrame);
      video.pause();
      rotation = 0;
      lastDraw = -Infinity;
      lastState = -Infinity;
      video.src = url;
      video.load();
      try {
        await waitForPhoneVideoFrame(video, Promise.all([graph.context.resume(), video.play()]), abort.signal);
        if (!stopped && !abort.signal.aborted) { paint(); emit(); }
      } finally {
        if (sourceLoadAbort === abort && !stopped) schedule();
      }
    },
    setPreviewMuted(muted: boolean) { monitor.gain.value = muted ? 0 : 1; },
    async command(action: string) {
      if (stopped) return;
      if (action === 'video:rotate') rotation = (rotation + 90) % 360;
      else if (action === 'video:fit:cover') fitMode = 'cover';
      else if (action === 'video:fit:contain') fitMode = 'contain';
      else if (action === 'pause') video.pause();
      else if (action === 'play') await video.play();
      else if (action === 'stop') { video.pause(); video.currentTime = 0; }
      else if (action.startsWith('video:seek-by:')) {
        const offset = Number(action.slice('video:seek-by:'.length));
        if (Number.isFinite(offset) && Number.isFinite(video.duration)) video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + offset));
      } else if (action.startsWith('video:seek:')) {
        const target = Number(action.slice('video:seek:'.length));
        if (Number.isFinite(target) && Number.isFinite(video.duration)) video.currentTime = Math.max(0, Math.min(video.duration, target));
      }
      redraw();
    },
  };
}

export type PhoneVideoStream = ReturnType<typeof startPhoneVideoStream>;
