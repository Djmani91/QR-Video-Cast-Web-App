type TvVideo = HTMLVideoElement & {
  webkitEnterFullscreen?: () => void | Promise<void>;
  webkitEnterFullScreen?: () => void | Promise<void>;
  webkitExitFullscreen?: () => void | Promise<void>;
  webkitExitFullScreen?: () => void | Promise<void>;
  webkitRequestFullscreen?: () => void | Promise<void>;
  webkitRequestFullScreen?: () => void | Promise<void>;
  webkitDisplayingFullscreen?: boolean;
  webkitPresentationMode?: string;
};
type TvDocument = Document & {
  webkitFullscreenElement?: Element;
  webkitExitFullscreen?: () => void | Promise<void>;
  webkitCancelFullScreen?: () => void | Promise<void>;
};

export function isVideoFullscreen(video: HTMLVideoElement, doc: Document = document): boolean {
  const media = video as TvVideo;
  const page = doc as TvDocument;
  return Boolean(doc.fullscreenElement || page.webkitFullscreenElement
    || media.webkitDisplayingFullscreen || media.webkitPresentationMode === 'fullscreen');
}

/** Fullscreen the VIDEO, never the document. Try TV-native media APIs first. */
export async function requestVideoFullscreen(video: HTMLVideoElement): Promise<boolean> {
  const media = video as TvVideo;
  const requests = [
    media.webkitEnterFullscreen,
    media.webkitEnterFullScreen,
    media.requestFullscreen,
    media.webkitRequestFullscreen,
    media.webkitRequestFullScreen,
  ];
  for (const request of requests) {
    if (!request) continue;
    try {
      await request.call(media);
      return true;
    } catch {
      // An exposed API can still reject. Try the next TV/browser implementation.
    }
  }
  return false;
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
