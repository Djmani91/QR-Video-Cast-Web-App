type TvVideo = HTMLVideoElement & {
  webkitEnterFullscreen?: () => void | Promise<void>;
  webkitEnterFullScreen?: () => void | Promise<void>;
  webkitExitFullscreen?: () => void | Promise<void>;
  webkitExitFullScreen?: () => void | Promise<void>;
  webkitRequestFullscreen?: () => void | Promise<void>;
  webkitRequestFullScreen?: () => void | Promise<void>;
  webkitDisplayingFullscreen?: boolean;
  webkitPresentationMode?: string;
  webkitSupportsFullscreen?: boolean;
};
type TvDocument = Document & {
  webkitFullscreenElement?: Element;
  webkitCurrentFullScreenElement?: Element;
  webkitIsFullScreen?: boolean;
  webkitExitFullscreen?: () => void | Promise<void>;
  webkitCancelFullScreen?: () => void | Promise<void>;
};

/** Photos and corrected videos need their playback container in fullscreen. */
export async function requestMediaFullscreen(element: HTMLElement): Promise<boolean> {
  // An exposed method is not proof that this document can use it. Some TV
  // implementations display a system dialog instead of rejecting quietly.
  if (element.ownerDocument?.fullscreenEnabled === false) return false;
  const target = element as HTMLElement & {
    webkitRequestFullscreen?: () => void | Promise<void>;
    webkitRequestFullScreen?: () => void | Promise<void>;
  };
  for (const request of [target.requestFullscreen, target.webkitRequestFullscreen, target.webkitRequestFullScreen]) {
    if (!request) continue;
    try {
      await request.call(target);
      if (isVideoFullscreen(element as HTMLVideoElement)) return true;
    } catch { /* Try the TV's legacy API. */ }
  }
  return false;
}

export function isVideoFullscreen(video: HTMLVideoElement, doc: Document | undefined = video.ownerDocument ?? globalThis.document): boolean {
  const media = video as TvVideo;
  const page = doc as TvDocument;
  return Boolean(doc?.fullscreenElement || page?.webkitFullscreenElement || page?.webkitCurrentFullScreenElement || page?.webkitIsFullScreen
    || media.webkitDisplayingFullscreen || media.webkitPresentationMode === 'fullscreen');
}

/** Only enter a native media player when it explicitly supports this source. */
export async function requestVideoFullscreen(video: HTMLVideoElement): Promise<boolean> {
  const media = video as TvVideo;
  const nativeRequests = !video.srcObject && media.webkitSupportsFullscreen === true ? [
    media.webkitEnterFullscreen,
    media.webkitEnterFullScreen,
  ] : [];
  const elementRequests = [
    media.requestFullscreen,
    media.webkitRequestFullscreen,
    media.webkitRequestFullScreen,
  ];
  // Samsung can expose these native methods for sources its movie player
  // cannot open. Calling them for WebRTC can show an OS "not supported" dialog.
  const requests = [...new Set([...nativeRequests, ...elementRequests])];
  let unconfirmed = false;
  for (const request of requests) {
    if (!request) continue;
    try {
      const result = request.call(media);
      // Legacy native APIs return void. Keep the next fallback in the same
      // click/remote gesture rather than inserting an unnecessary await.
      if (result && typeof result.then === 'function') await result;
      if (isVideoFullscreen(video)) return true;
      unconfirmed = true;
    } catch {
      // An exposed API can still reject. Try the next TV/browser implementation.
    }
  }
  if (unconfirmed) {
    // Some TV overlays update their fullscreen flags on a later event/task.
    await new Promise<void>(resolve => setTimeout(resolve, 200));
    return isVideoFullscreen(video);
  }
  return false;
}

/** Keep media on the browser surface unless native source support is confirmed. */
export async function requestReceiverFullscreen(
  video: HTMLVideoElement,
  stage: HTMLElement | null,
  canvasPlayback = false,
): Promise<boolean> {
  if (video.srcObject || canvasPlayback || (stage && (video as TvVideo).webkitSupportsFullscreen !== true)) {
    return stage ? requestMediaFullscreen(stage) : false;
  }
  if (await requestVideoFullscreen(video)) return true;
  return stage ? requestMediaFullscreen(stage) : false;
}

export async function exitVideoFullscreen(video: HTMLVideoElement, doc: Document = document): Promise<boolean> {
  const media = video as TvVideo;
  const page = doc as TvDocument;
  const requests: Array<[object, (() => void | Promise<void>) | undefined]> =
    media.webkitDisplayingFullscreen || media.webkitPresentationMode === 'fullscreen'
      ? [[media, media.webkitExitFullscreen], [media, media.webkitExitFullScreen], [page, page.exitFullscreen], [page, page.webkitExitFullscreen]]
      : [[page, page.exitFullscreen], [page, page.webkitExitFullscreen], [page, page.webkitCancelFullScreen], [media, media.webkitExitFullscreen]];
  for (const [owner, request] of requests) {
    if (!request) continue;
    try { await request.call(owner); return true; } catch { /* Try legacy API. */ }
  }
  return false;
}
