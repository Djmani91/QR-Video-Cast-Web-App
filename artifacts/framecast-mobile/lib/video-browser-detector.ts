export type DetectedVideoSource = {
  url: string;
  label: string;
};

export type VideoBrowserScan = {
  pageTitle: string;
  videoCount: number;
  opaqueVideoCount: number;
  candidates: DetectedVideoSource[];
};

const MAX_MESSAGE_LENGTH = 100_000;
const MAX_CANDIDATES = 8;

function safeMediaUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 8_192) return null;
  try {
    const parsed = new URL(value);
    if (
      (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') ||
      !parsed.hostname ||
      parsed.username ||
      parsed.password
    ) {
      return null;
    }
    return parsed.href;
  } catch {
    return null;
  }
}

export function parseVideoBrowserMessage(rawMessage: string): VideoBrowserScan | null {
  if (rawMessage.length > MAX_MESSAGE_LENGTH) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawMessage);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== 'object') return null;
  const message = parsed as Record<string, unknown>;
  if (message.type !== 'framecast_video_scan') return null;

  const inputCandidates = Array.isArray(message.candidates) ? message.candidates : [];
  const candidates: DetectedVideoSource[] = [];
  const seen = new Set<string>();
  for (const value of inputCandidates) {
    if (!value || typeof value !== 'object') continue;
    const candidate = value as Record<string, unknown>;
    const url = safeMediaUrl(candidate.url);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const label = typeof candidate.label === 'string' ? candidate.label.slice(0, 32) : 'Website video';
    candidates.push({ url, label });
    if (candidates.length >= MAX_CANDIDATES) break;
  }

  const asCount = (value: unknown) => (
    typeof value === 'number' && Number.isFinite(value)
      ? Math.max(0, Math.min(100, Math.floor(value)))
      : 0
  );

  return {
    pageTitle: typeof message.pageTitle === 'string' ? message.pageTitle.slice(0, 160) : '',
    videoCount: asCount(message.videoCount),
    opaqueVideoCount: asCount(message.opaqueVideoCount),
    candidates,
  };
}

/**
 * This runs only inside the Android WebView's top-level page. It looks for
 * ordinary HTML video sources and public video metadata. It deliberately
 * ignores blob:, data:, file:, and cross-origin iframe internals.
 */
export const VIDEO_BROWSER_DETECTION_SCRIPT = String.raw`
(function () {
  if (window.__framecastVideoDetector) {
    window.__framecastVideoDetector.scan();
    return true;
  }

  function sourceLabel(url) {
    var path = '';
    try { path = new URL(url).pathname.toLowerCase(); } catch (_) {}
    if (/\.m3u8$/.test(path)) return 'HLS stream';
    if (/\.mpd$/.test(path)) return 'DASH stream';
    if (/\.(mp4|m4v|mov|webm|ogv)$/.test(path)) return 'Video file';
    return 'Website video';
  }

  function scan() {
    var candidates = [];
    var seen = {};
    var videos = Array.prototype.slice.call(document.querySelectorAll('video'));
    var opaqueVideoCount = 0;

    function addCandidate(value, label) {
      if (!value || typeof value !== 'string') return;
      try {
        var url = new URL(value, window.location.href);
        if ((url.protocol !== 'https:' && url.protocol !== 'http:') || !url.hostname || url.username || url.password) return;
        if (!seen[url.href] && candidates.length < 8) {
          seen[url.href] = true;
          candidates.push({ url: url.href, label: label || sourceLabel(url.href) });
        }
      } catch (_) {}
    }

    videos.forEach(function (video) {
      var before = candidates.length;
      addCandidate(video.currentSrc, sourceLabel(video.currentSrc || ''));
      addCandidate(video.src, sourceLabel(video.src || ''));
      Array.prototype.slice.call(video.querySelectorAll('source')).forEach(function (source) {
        addCandidate(source.src || source.getAttribute('src'), sourceLabel(source.src || ''));
      });
      if (candidates.length === before && ((video.currentSrc || '').indexOf('blob:') === 0 || (video.src || '').indexOf('blob:') === 0)) {
        opaqueVideoCount += 1;
      }
    });

    Array.prototype.slice.call(document.querySelectorAll(
      'meta[property="og:video"], meta[property="og:video:url"], meta[name="twitter:player:stream"]'
    )).forEach(function (meta) {
      addCandidate(meta.content, 'Page video link');
    });

    var payload = {
      type: 'framecast_video_scan',
      pageTitle: document.title || '',
      videoCount: videos.length,
      opaqueVideoCount: opaqueVideoCount,
      candidates: candidates
    };
    var fingerprint = JSON.stringify(payload);
    if (fingerprint !== window.__framecastVideoFingerprint &&
        window.ReactNativeWebView &&
        typeof window.ReactNativeWebView.postMessage === 'function') {
      window.__framecastVideoFingerprint = fingerprint;
      window.ReactNativeWebView.postMessage(fingerprint);
    }
  }

  window.__framecastVideoDetector = { scan: scan };
  document.addEventListener('loadedmetadata', scan, true);
  document.addEventListener('durationchange', scan, true);
  document.addEventListener('play', scan, true);
  document.addEventListener('canplay', scan, true);
  window.setInterval(scan, 1500);
  scan();
  window.setTimeout(scan, 250);
})();
true;
`;
