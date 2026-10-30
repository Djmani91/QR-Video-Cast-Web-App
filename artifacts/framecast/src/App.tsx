import { type FormEvent, type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import {
  getGetCastRoomMessagesQueryKey,
  useCreateCastRoom,
  useGetCastRoomMessages,
  useLookupCastRoomByCode,
  useSendCastRoomMessage,
  type CastSignalType,
} from '@workspace/api-client-react';
import { QRCodeSVG } from 'qrcode.react';
import { createFile } from 'mp4box';
import { assertBrowserFileReadable, isSelectedMediaAccessError, preserveBrowserSelection, SelectedMediaAccessError } from './lib/browser-media';
import { exitVideoFullscreen, isVideoFullscreen, requestReceiverFullscreen, requestMediaFullscreen } from './lib/video-fullscreen';
import { normalizeRotation, requiredVideoRotation, type VideoOrientation } from './lib/media-orientation';
import { ROTATION_RENDERER_VERSION, verifyRotationRenderer } from './lib/rotation-renderer';
import { RotatedVideoCanvas } from './components/RotatedVideoCanvas';
import { needsVideoCanvas } from './lib/rotated-video-canvas';
import { createConnectionGrace } from './lib/connection-grace';
import { createAutoFullscreen } from './lib/auto-fullscreen';
import { createPeerProbe, createSessionRecovery, matchesSession, peerIsOpening, type ScopedIceCandidate } from './lib/session-recovery';
import { startReceiverVideo, tvVideoPresentation, waitForVideoStartup, type VideoStartup } from './lib/video-startup';
import { createPhoneAudioGraph, startPhoneVideoStream, type PhoneAudioGraph, type PhoneVideoState, type PhoneVideoStream } from './lib/phone-video-stream';
import { createScreenMirrorAudioPlayer, type ScreenMirrorAudioPlayer } from './lib/screen-mirror-audio';
import { configureVideoSender, preferHardwareVideoCodec } from './lib/video-stream-quality';
import { monitorVideoStream, readVideoStats, type StreamHealth } from './lib/video-stream-health';
import { MAX_PLAYLIST_ITEMS, movePlaylistItem, playlistNeighbour } from './lib/video-playlist';
import { VideoPlaylist } from './components/VideoPlaylist';
import { TvCinemaWaitingScreen } from './components/TvCinemaWaitingScreen';
import { getYouTubeVideoId } from './lib/youtube';
import { YouTubePlayer, type YouTubePlayerApi } from '@/components/youtube-player';
import { BrowserQRCodeReader } from '@zxing/browser';
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  CircleAlert,
  FileVideo2,
  Maximize2,
  Image as ImageIcon,
  LockKeyhole,
  Monitor,
  Minimize2,
  Pause,
  Play,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  ScanLine,
  Volume2,
  VolumeX,
  Wifi,
  X,
} from 'lucide-react';
import {
  Link,
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

const queryClient = new QueryClient();

type PeerStatus = 'idle' | 'paired' | 'connecting' | 'connected' | 'disconnected' | 'failed';
type MediaKind = 'video' | 'image';
function formatPlaybackTime(seconds: number) {
  const value = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const remainder = value % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
    : `${minutes}:${String(remainder).padStart(2, '0')}`;
}

function normalizeVideoLink(input: string) {
  let parsed: URL;
  try {
    parsed = new URL(input.trim());
  } catch {
    throw new Error('Paste a complete video or webpage link.');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Use a link that starts with http:// or https://.');
  }
  return parsed.href;
}

function findVideoUrlInPage(html: string, pageUrl: string) {
  const candidates: string[] = [];
  for (const match of html.matchAll(/<(?:video|source)\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi)) {
    candidates.push(match[1].replace(/&amp;/gi, '&').trim());
  }
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const name = tag.match(/(?:property|name)\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase();
    if (!name || !['og:video', 'og:video:url', 'twitter:player:stream'].includes(name)) continue;
    const content = tag.match(/\bcontent\s*=\s*["']([^"']+)["']/i)?.[1];
    if (content) candidates.push(content.replace(/&amp;/gi, '&').trim());
  }
  for (const candidate of candidates) {
    try {
      const url = new URL(candidate, pageUrl);
      if (url.protocol === 'https:' || url.protocol === 'http:') return url.href;
    } catch {
      // Skip malformed source attributes.
    }
  }
  return null;
}

async function resolveVideoLink(input: string) {
  const url = normalizeVideoLink(input);
  if (getYouTubeVideoId(url)) return url;
  const parsed = new URL(url);
  if (/\.(mp4|m4v|mov|webm|m3u8|mpd|ogv)$/i.test(parsed.pathname)) return url;

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      headers: { Accept: 'text/html,application/xhtml+xml,video/*,application/vnd.apple.mpegurl,*/*;q=0.8' },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`The link returned an error (${response.status}).`);
    const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
    if (contentType.startsWith('video/') || contentType.includes('mpegurl') || contentType.includes('dash+xml')) return url;
    if (contentType && !contentType.includes('html') && !contentType.includes('text/plain')) {
      throw new Error('This link does not point to a video or a readable webpage.');
    }
    const contentLength = Number(response.headers.get('content-length') ?? 0);
    if (contentLength > 5 * 1024 * 1024) throw new Error('This webpage is too large to inspect in the browser.');
    const html = await response.text();
    if (html.length > 5 * 1024 * 1024) throw new Error('This webpage is too large to inspect in the browser.');
    const videoUrl = findVideoUrlInPage(html, url);
    if (videoUrl) return videoUrl;
    throw new Error('No directly playable video was found. Try a direct MP4/M3U8 link; sign-in and protected streams may not work.');
  } finally {
    window.clearTimeout(timeout);
  }
}
type Mp4TrackInfo = { codec?: string; video?: unknown; audio?: unknown };
type Mp4ParserLike = {
  onReady: ((info: { isFragmented: boolean; tracks: Mp4TrackInfo[] }) => void) | null;
  onError: ((message: string) => void) | null;
  appendBuffer: (buffer: ArrayBuffer & { fileStart: number }) => number;
};
type VideoStreamSession = {
  mediaSource: MediaSource;
  url: string;
  parser: Mp4ParserLike;
  info?: { isFragmented: boolean; tracks: Mp4TrackInfo[] };
  sourceBuffer: SourceBuffer | null;
  initialChunks: ArrayBuffer[];
  appendQueue: ArrayBuffer[];
  fileOffset: number;
  initialized: boolean;
  complete: boolean;
  failed: boolean;
  initTimer: number;
  fail: (message: string) => void;
};
// STUN helps peers discover a direct route; no TURN server is configured, so media is never relayed.
const rtcConfig: RTCConfiguration = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

function BrandHeader({ phone = false }: { phone?: boolean }) {
  return (
    <header className="topbar">
      <Link href="/" className="brand" data-testid="link-framecast-home" aria-label="FrameCast home">
        <span className="brand-mark"><Monitor size={19} strokeWidth={2.2} /></span>
        <span className="brand-name">framecast</span>
      </Link>
      <span className="topbar-note">
        {phone ? <><LockKeyhole size={14} /> No video upload</> : <><Wifi size={14} /> Works in your browser</>}
        <span className="topbar-domain" data-testid="text-public-domain">2tx1.com</span>
      </span>
    </header>
  );
}

function PhoneJoinPage() {
  const lookup = useLookupCastRoomByCode();
  const [, setLocation] = useLocation();
  const [code, setCode] = useState('');
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState('');
  const scannerVideoRef = useRef<HTMLVideoElement>(null);
  const scannerControlRef = useRef<{ stop: () => void } | null>(null);
  const scannerSupported = typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);

  const openScannedLink = useCallback((value: string) => {
    try {
      const scannedUrl = new URL(value, window.location.origin);
      const match = scannedUrl.pathname.match(/\/send\/([^/]+)\/?$/);
      if (!match) {
        setError('That code is not a FrameCast pairing link. Scan the code shown on the TV.');
        return;
      }
      scannerControlRef.current?.stop();
      setScanning(false);
      setError('');
      setLocation(`/send/${encodeURIComponent(decodeURIComponent(match[1]))}`);
    } catch {
      setError('We couldn’t read that QR code. Try again or enter the five-digit code.');
    }
  }, [setLocation]);

  useEffect(() => {
    if (!scanning || !scannerVideoRef.current) return;
    const reader = new BrowserQRCodeReader();
    let active = true;
    reader.decodeFromVideoDevice(undefined, scannerVideoRef.current, (result) => {
      if (active && result) openScannedLink(result.getText());
    }).then((controls) => {
      if (active) scannerControlRef.current = controls;
      else controls.stop();
    }).catch(() => {
      if (active) {
        setScanning(false);
        setError('Camera access is unavailable. Allow camera access or enter the code instead.');
      }
    });
    return () => {
      active = false;
      scannerControlRef.current?.stop();
      scannerControlRef.current = null;
    };
  }, [scanning, openScannedLink]);

  const submitCode = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    if (!/^\d{5}$/.test(code)) {
      setError('Enter all five digits from the TV screen.');
      return;
    }
    lookup.mutate({ data: { code } }, {
      onSuccess: (result) => setLocation(`/send/${encodeURIComponent(result.roomId)}`),
      onError: () => setError('We couldn’t find that room. Check the code and try again.'),
    });
  };

  return (
    <div className="app-shell">
      <BrandHeader phone />
      <main className="page-wrap">
        <section className="join-page fade-in">
          <div className="phone-heading">
            <span className="eyebrow">Start with the TV</span>
            <h1>Join the screen.</h1>
            <p>Scan the QR code or enter the five-digit code displayed on the TV.</p>
          </div>
          <div className="join-card">
            {scanning ? (
              <div className="scanner-frame">
                <video ref={scannerVideoRef} className="scanner-video" autoPlay muted playsInline aria-label="Live camera QR scanner" data-testid="video-qr-scanner" />
                <span className="scanner-reticle" aria-hidden="true" />
                <p role="status" data-testid="status-qr-scanner">Hold the TV’s FrameCast QR code inside the frame.</p>
              </div>
            ) : (
              <button type="button" className="scan-launch" onClick={() => { setError(''); setScanning(true); }} disabled={!scannerSupported} data-testid="button-start-scan">
                <span className="scan-icon"><ScanLine size={22} /></span>
                <span><strong>Scan the TV’s QR code</strong><small>{scannerSupported ? 'Use your camera to pair instantly' : 'Camera scanning is not available in this browser'}</small></span>
                <ArrowUpRight size={17} />
              </button>
            )}
            {scanning && <button type="button" className="button-quiet scanner-stop" onClick={() => setScanning(false)} data-testid="button-stop-scan">Close scanner</button>}
            <div className="join-divider"><span>or enter the code</span></div>
            <form className="code-form" onSubmit={submitCode}>
              <label htmlFor="pairing-code">Five-digit TV code</label>
              <div className="code-entry">
                <input
                  id="pairing-code"
                  value={code}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{5}"
                  maxLength={5}
                  placeholder="00000"
                  onChange={(event) => setCode(event.currentTarget.value.replace(/\D/g, '').slice(0, 5))}
                  aria-describedby="code-help"
                  data-testid="input-pairing-code"
                />
                <button type="submit" className="button-primary" disabled={code.length !== 5 || lookup.isPending} data-testid="button-join-code">
                  {lookup.isPending ? <RefreshCw size={16} className="animate-spin" /> : <ArrowUpRight size={16} />}
                  {lookup.isPending ? 'Finding room…' : 'Join'}
                </button>
              </div>
              <small id="code-help">The code is shown next to the QR code on the TV.</small>
            </form>
            {error && <div className="error-banner" role="alert" data-testid="text-join-error">{error}</div>}
          </div>
          <div className="join-privacy">
            <LockKeyhole size={16} />
            <p><strong>Direct, same-Wi-Fi connection.</strong> Keep your phone and the TV on the same network. Your media stays on your phone until it streams directly to the screen.</p>
          </div>
        </section>
      </main>
    </div>
  );
}

function useSignalSender(roomId: string) {
  const sendSignal = useSendCastRoomMessage();
  const sendRef = useRef(sendSignal.mutate);
  sendRef.current = sendSignal.mutate;
  return useCallback((from: 'tv' | 'phone', type: CastSignalType, payload: Record<string, unknown> = {}) => {
    sendRef.current({ roomId, data: { from, type, payload } });
  }, [roomId]);
}

const MAX_MEDIA_SIZE_BYTES = 256 * 1024 * 1024;
const MAX_MEDIA_QUEUE_SIZE_BYTES = 256 * 1024 * 1024;
const MAX_VIDEO_SIZE_BYTES = 8 * 1024 * 1024 * 1024;
const BUFFERED_VIDEO_FALLBACK_MAX_BYTES = 128 * 1024 * 1024;
const MEDIA_CHUNK_SIZE_BYTES = 32 * 1024;
const DATA_CHANNEL_BUFFER_LIMIT_BYTES = 512 * 1024;

function getMediaMimeType(file: File, kind: MediaKind) {
  if (file.type) return file.type;
  const extension = file.name.toLowerCase().split('.').pop() ?? '';
  if (kind === 'video') {
    if (extension === 'mov') return 'video/quicktime';
    if (extension === 'webm') return 'video/webm';
    if (extension === 'm4v') return 'video/x-m4v';
    return 'video/mp4';
  }
  if (extension === 'png') return 'image/png';
  if (extension === 'webp') return 'image/webp';
  if (extension === 'gif') return 'image/gif';
  return 'image/jpeg';
}

async function preparePhotoForTransfer(file: File): Promise<File> {
  if (file.type !== 'image/jpeg' || file.size < 1_500_000) return file;
  const previewUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = previewUrl;
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('This photo could not be prepared.'));
    });
    const largestSide = Math.max(image.naturalWidth, image.naturalHeight);
    const scale = Math.min(1, 2560 / largestSide);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) return file;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const compressed = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.84));
    if (!compressed || compressed.size >= file.size) return file;
    const baseName = file.name.replace(/\.[^.]+$/, '');
    return new File([compressed], `${baseName}.jpg`, { type: 'image/jpeg', lastModified: file.lastModified });
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(previewUrl);
  }
}

async function createPhotoPreviewDataUrl(file: File): Promise<string | undefined> {
  const sourceUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = sourceUrl;
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Could not make a quick photo preview.'));
    });
    const scale = Math.min(1, 480 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) return undefined;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const preview = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.3));
    if (!preview || preview.size > 40_000) return undefined;
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Could not encode photo preview.'));
      reader.onerror = () => reject(new Error('Could not encode photo preview.'));
      reader.readAsDataURL(preview);
    });
  } catch {
    return undefined;
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

function photoPreviewBlob(dataUrl: string): Blob | undefined {
  try {
    const [header, encoded] = dataUrl.split(',', 2);
    if (!header || !encoded || encoded.length > 58_000) return undefined;
    const mimeType = header.match(/^data:(image\/[a-z0-9.+-]+);base64$/i)?.[1];
    if (!mimeType) return undefined;
    const binary = atob(encoded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return new Blob([bytes], { type: mimeType });
  } catch {
    return undefined;
  }
}

function drainVideoStream(session: VideoStreamSession, video: HTMLVideoElement) {
  const sourceBuffer = session.sourceBuffer;
  if (!sourceBuffer || sourceBuffer.updating || session.failed) return;
  try {
    if (video.currentTime > 45 && sourceBuffer.buffered.length > 0) {
      const bufferedStart = sourceBuffer.buffered.start(0);
      const removeBefore = video.currentTime - 30;
      if (bufferedStart < removeBefore) {
        sourceBuffer.remove(bufferedStart, removeBefore);
        return;
      }
    }
    const firstChunk = session.appendQueue[0];
    const appendSizeLimit = 256 * 1024;
    let chunkCount = 0;
    let appendSize = 0;
    while (chunkCount < session.appendQueue.length && appendSize < appendSizeLimit) {
      appendSize += session.appendQueue[chunkCount].byteLength;
      chunkCount += 1;
    }
    const nextChunks = session.appendQueue.splice(0, chunkCount);
    const nextChunk = nextChunks.length === 1
      ? firstChunk
      : nextChunks.length > 1
        ? (() => {
          const combined = new Uint8Array(appendSize);
          let offset = 0;
          for (const part of nextChunks) {
            combined.set(new Uint8Array(part), offset);
            offset += part.byteLength;
          }
          return combined.buffer;
        })()
        : undefined;
    if (nextChunk) {
      sourceBuffer.appendBuffer(nextChunk);
      return;
    }
    if (session.complete && session.mediaSource.readyState === 'open') {
      session.mediaSource.endOfStream();
    }
  } catch {
    session.fail('The TV browser could not buffer this stream. Choose a standard H.264/AAC fragmented MP4.');
  }
}

async function waitForDataChannelBuffer(channel: RTCDataChannel) {
  while (channel.bufferedAmount > DATA_CHANNEL_BUFFER_LIMIT_BYTES) {
    if (channel.readyState !== 'open') {
      throw new Error('The direct connection closed before the file finished sending.');
    }
    await new Promise<void>((resolve) => window.setTimeout(resolve, 20));
  }
  if (channel.readyState !== 'open') {
    throw new Error('The direct connection closed before the file finished sending.');
  }
}

function TvPage() {
  const createRoom = useCreateCastRoom();
  const { mutate: createRoomMutation, data: createdRoom, isPending: creatingRoom, isError: createRoomError } = createRoom;
  const createRoomRef = useRef(createRoomMutation);
  createRoomRef.current = createRoomMutation;
  const [room, setRoom] = useState<{ id: string; code: string; expiresAt: string } | null>(() => {
    if (new URLSearchParams(window.location.search).get('resume') !== '1') return null;
    try {
      const saved = JSON.parse(sessionStorage.getItem('framecast-tv-resume') || 'null');
      return saved && typeof saved.id === 'string' && typeof saved.code === 'string' && typeof saved.expiresAt === 'string' ? saved : null;
    } catch { return null; }
  });
  const resumeAfterRef = useRef(Number(new URLSearchParams(window.location.search).get('after')) || 0);
  const [status, setStatus] = useState<PeerStatus>('idle');
  const [mediaKind, setMediaKind] = useState<MediaKind>('video');
  const [screenMirroring, setScreenMirroring] = useState(false);
  const screenMirroringRef = useRef(false);
  const receiverMediaKindRef = useRef(mediaKind);
  receiverMediaKindRef.current = mediaKind;
  const [error, setError] = useState('');
  const [muted, setMuted] = useState(true);
  const [playing, setPlaying] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [youtubeVideoId, setYoutubeVideoId] = useState<string | null>(null);
  const youtubePlayerRef = useRef<YouTubePlayerApi | null>(null);
  const youtubeMediaChannelRef = useRef<RTCDataChannel | null>(null);
  const [clock, setClock] = useState(Date.now());
  const [browserFullscreen, setBrowserFullscreen] = useState(false);
  const [needsStandbyFullscreen, setNeedsStandbyFullscreen] = useState(false);
  const autoCinemaFullscreenRoomRef = useRef<string | null>(null);
  const [needsVideoFullscreen, setNeedsVideoFullscreen] = useState(false);
  const [videoReturnedInline, setVideoReturnedInline] = useState(false);
  const [playlistTransitioning, setPlaylistTransitioning] = useState(false);
  const playlistTransitioningRef = useRef(false);
  const playlistTransitionTimerRef = useRef<number | null>(null);
  const [photoReturnedInline, setPhotoReturnedInline] = useState(false);
  const [needsPhotoFullscreen, setNeedsPhotoFullscreen] = useState(false);
  const photoFullscreenAttemptedRef = useRef(false);
  const playbackStageRef = useRef<HTMLElement>(null);
  const [videoRotation, setVideoRotation] = useState(0);
  const videoRotationRef = useRef(0);
  const orientationSourceRef = useRef<VideoOrientation | null>(null);
  const manualRotationRef = useRef(0);
  const [videoFitMode, setVideoFitMode] = useState<'cover' | 'contain'>('contain');
  const [connectionGrace] = useState(createConnectionGrace);
  const videoFitModeRef = useRef<'cover' | 'contain'>('contain');
  const [canvasPlayback, setCanvasPlayback] = useState(false);
  const canvasPlaybackRef = useRef(false);
  const canvasUnavailableRef = useRef(false);
  const videoMediaChannelRef = useRef<RTCDataChannel | null>(null);
  const phoneRenderedVideoRef = useRef(false);
  const phoneVideoStateRef = useRef<PhoneVideoState | null>(null);
  const finishPlaylistTransition = useCallback(() => {
    playlistTransitioningRef.current = false;
    setPlaylistTransitioning(false);
    if (playlistTransitionTimerRef.current !== null) {
      window.clearTimeout(playlistTransitionTimerRef.current);
      playlistTransitionTimerRef.current = null;
    }
  }, []);
  const beginPlaylistTransition = useCallback((channel: RTCDataChannel) => {
    playlistTransitioningRef.current = true;
    setPlaylistTransitioning(true);
    setVideoReturnedInline(false);
    setError('');
    if (playlistTransitionTimerRef.current !== null) window.clearTimeout(playlistTransitionTimerRef.current);
    playlistTransitionTimerRef.current = window.setTimeout(() => {
      if (!playlistTransitioningRef.current) return;
      finishPlaylistTransition();
      setVideoReturnedInline(true);
      setError('The next video did not start. Reconnect from the phone and try again.');
    }, 90_000);
    try {
      if (channel.readyState === 'open') {
        channel.send(JSON.stringify({ framecast: 'playlist-next-loading-ack' }));
      }
    } catch {
      // Keep the transition screen until playback starts or the timeout expires.
    }
  }, [finishPlaylistTransition]);
  useEffect(() => () => {
    if (playlistTransitionTimerRef.current !== null) window.clearTimeout(playlistTransitionTimerRef.current);
  }, []);
  const relayPhoneVideoCommand = useCallback((action: string) => {
    const channel = controlChannelRef.current;
    if (channel?.readyState === 'open') channel.send(JSON.stringify({ framecast: 'live-command', action }));
  }, []);
  const applyVideoOrientation = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const rotation = normalizeRotation(requiredVideoRotation(orientationSourceRef.current, video.videoWidth, video.videoHeight) + manualRotationRef.current);
    videoRotationRef.current = rotation;
    setVideoRotation(rotation);
    const source = orientationSourceRef.current;
    const width = source?.orientationNormalized ? source.encodedWidth : video.videoWidth || source?.encodedWidth || 0;
    const height = source?.orientationNormalized ? source.encodedHeight : video.videoHeight || source?.encodedHeight || 0;
    const canvas = !phoneRenderedVideoRef.current && !canvasUnavailableRef.current && needsVideoCanvas(rotation, videoFitModeRef.current, width, height, window.innerWidth, window.innerHeight);
    canvasPlaybackRef.current = canvas;
    setCanvasPlayback(canvas);
    video.playsInline = true;
    video.setAttribute('webkit-playsinline', '');
  }, []);
  const requestPlaybackFullscreen = useCallback(async (video: HTMLVideoElement) => {
    return requestReceiverFullscreen(video, playbackStageRef.current, canvasPlaybackRef.current);
  }, []);
  const handleCanvasFailure = useCallback(() => {
    // A presentation enhancement must never stop the underlying TV decoder.
    canvasUnavailableRef.current = true;
    canvasPlaybackRef.current = false;
    setCanvasPlayback(false);
    const video = videoRef.current;
    if (video) {
      video.playsInline = true;
      video.setAttribute('webkit-playsinline', '');
    }
    const channel = videoMediaChannelRef.current;
    if (channel?.readyState === 'open') channel.send(JSON.stringify({
      framecast: 'playback-warning',
      message: 'The TV is using its standard video player because wide-screen drawing is unavailable. Rotation or cropping may be limited on this TV.',
    }));
  }, []);
  const rotateCurrentVideo = useCallback(() => {
    if (phoneRenderedVideoRef.current) {
      relayPhoneVideoCommand('video:rotate');
      return;
    }
    manualRotationRef.current = normalizeRotation(manualRotationRef.current + 90);
    applyVideoOrientation();
    const video = videoRef.current;
    if (video && isVideoFullscreen(video) && document.fullscreenElement !== playbackStageRef.current) {
      void exitVideoFullscreen(video).then(() => {
        setVideoReturnedInline(false);
        return requestPlaybackFullscreen(video);
      }).then((entered) => setNeedsVideoFullscreen(!entered));
    }
  }, [applyVideoOrientation, requestPlaybackFullscreen]);
  const changeVideoFit = useCallback((mode: 'cover' | 'contain') => {
    if (phoneRenderedVideoRef.current) {
      relayPhoneVideoCommand(`video:fit:${mode}`);
      return;
    }
    videoFitModeRef.current = mode;
    setVideoFitMode(mode);
    applyVideoOrientation();
    sendVideoState();
    const video = videoRef.current;
    if (video && canvasPlaybackRef.current && isVideoFullscreen(video) && document.fullscreenElement !== playbackStageRef.current) {
      void exitVideoFullscreen(video).then(() => requestPlaybackFullscreen(video))
        .then((entered) => setNeedsVideoFullscreen(!entered));
    }
  }, [applyVideoOrientation, requestPlaybackFullscreen]);
  const [autoFullscreen] = useState(createAutoFullscreen);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const controlChannelRef = useRef<RTCDataChannel | null>(null);
  const tvControlsIntervalRef = useRef<number | null>(null);
  const tvControlsVisibleRef = useRef(true);
  const lastTvActivityRef = useRef(0);
  const mediaObjectUrlsRef = useRef<string[]>([]);
  const mediaTransferRef = useRef<{ name: string; itemId?: string; mimeType: string; kind: MediaKind; size: number; sizeUnknown?: boolean; received: number; chunks: ArrayBuffer[]; streamMode?: boolean } | null>(null);
  const videoStreamRef = useRef<VideoStreamSession | null>(null);
  const [videoStreamActive, setVideoStreamActive] = useState(false);
  const [receivedImages, setReceivedImages] = useState<{ url: string; name: string; itemId?: string }[]>([]);
  const receivedImagesRef = useRef<{ url: string; name: string; itemId?: string }[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [imageZoom, setImageZoom] = useState(1);
  const [imageOffsetY, setImageOffsetY] = useState(0);
  const [tvControlsVisible, setTvControlsVisible] = useState(true);
  const [tvControlsCountdown, setTvControlsCountdown] = useState<number | null>(null);
  const [photoPreviewVisible, setPhotoPreviewVisible] = useState(false);
  const [transferProgress, setTransferProgress] = useState<number | null>(null);
  const hasActiveTvMedia = screenMirroring
    || Boolean(youtubeVideoId)
    || receivedImages.length > 0
    || transferProgress !== null
    || videoStreamActive
    || Boolean(videoRef.current?.src || videoRef.current?.currentSrc || videoRef.current?.srcObject);
  useEffect(() => {
    if (imageZoom === 1) setImageOffsetY(0);
  }, [imageZoom]);
  const seenRef = useRef(new Set<number>());
  const queuedCandidates = useRef<ScopedIceCandidate[]>([]);
  const activeSessionRef = useRef<string | null>(null);
  const roomId = room?.id ?? '';
  const revealTvControls = useCallback(() => {
    if (status !== 'connected') return;
    const now = Date.now();
    if (now - lastTvActivityRef.current < 120 && tvControlsVisibleRef.current) return;
    lastTvActivityRef.current = now;
    tvControlsVisibleRef.current = true;
    setTvControlsVisible(true);
    setTvControlsCountdown(5);
    if (tvControlsIntervalRef.current !== null) window.clearInterval(tvControlsIntervalRef.current);
    let seconds = 5;
    tvControlsIntervalRef.current = window.setInterval(() => {
      seconds -= 1;
      if (seconds <= 0) {
        if (tvControlsIntervalRef.current !== null) window.clearInterval(tvControlsIntervalRef.current);
        tvControlsIntervalRef.current = null;
        tvControlsVisibleRef.current = false;
        setTvControlsVisible(false);
        setTvControlsCountdown(null);
      } else {
        setTvControlsCountdown(seconds);
      }
    }, 1000);
  }, [status]);
  const send = useSignalSender(roomId);
  const screenMirrorAudioRef = useRef<ScreenMirrorAudioPlayer | null>(null);
  const messagesQuery = useGetCastRoomMessages(roomId, {
    query: {
      queryKey: getGetCastRoomMessagesQueryKey(roomId),
      refetchInterval: 700,
      enabled: Boolean(roomId),
    },
  });
  const messages = messagesQuery.data?.messages ?? [];

  const stopPeer = useCallback(() => {
    autoFullscreen.reset();
    connectionGrace.cancel();
    screenMirroringRef.current = false;
    setScreenMirroring(false);
    activeSessionRef.current = null;
    canvasUnavailableRef.current = false;
    videoMediaChannelRef.current = null;
    phoneRenderedVideoRef.current = false;
    phoneVideoStateRef.current = null;
    photoFullscreenAttemptedRef.current = false;
    setNeedsPhotoFullscreen(false);
    setPhotoReturnedInline(false);
    orientationSourceRef.current = null;
    manualRotationRef.current = 0;
    videoRotationRef.current = 0;
    setVideoRotation(0);
    canvasPlaybackRef.current = false;
    setCanvasPlayback(false);
    controlChannelRef.current?.close();
    controlChannelRef.current = null;
    screenMirrorAudioRef.current?.close();
    screenMirrorAudioRef.current = null;
    peerRef.current?.getReceivers().forEach((receiver) => receiver.track?.stop());
    peerRef.current?.close();
    peerRef.current = null;
    const videoStream = videoStreamRef.current;
    if (videoStream) {
      window.clearTimeout(videoStream.initTimer);
      try {
        if (videoStream.sourceBuffer?.updating) videoStream.sourceBuffer.abort();
        if (videoStream.mediaSource.readyState === 'open' && !videoStream.sourceBuffer?.updating) {
          videoStream.mediaSource.endOfStream();
        }
      } catch {
        // The TV browser may already have closed the MediaSource.
      }
    }
    videoStreamRef.current = null;
    setVideoStreamActive(false);
    youtubePlayerRef.current = null;
    youtubeMediaChannelRef.current = null;
    setYoutubeVideoId(null);
    mediaTransferRef.current = null;
    setTransferProgress(null);
    receivedImagesRef.current = [];
    setReceivedImages([]);
    setCurrentImageIndex(0);
    setImageZoom(1);
    setImageOffsetY(0);
    setPhotoPreviewVisible(false);
    for (const objectUrl of mediaObjectUrlsRef.current) URL.revokeObjectURL(objectUrl);
    mediaObjectUrlsRef.current = [];
    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current.removeAttribute('src');
      videoRef.current.load();
    }
  }, []);

  const sendVideoState = useCallback(() => {
    const channel = controlChannelRef.current;
    if (channel?.readyState !== 'open') return;
    const youtube = youtubePlayerRef.current;
    if (youtube) {
      const currentTime = youtube.getCurrentTime();
      const duration = youtube.getDuration();
      channel.send(JSON.stringify({
        framecast: 'video-state',
        fullscreen: videoRef.current ? isVideoFullscreen(videoRef.current) : Boolean(document.fullscreenElement),
        currentTime: Number.isFinite(currentTime) ? currentTime : 0,
        duration: Number.isFinite(duration) ? duration : 0,
        paused: youtube.getPlayerState() !== 1,
        volume: youtube.isMuted() ? 0 : youtube.getVolume() / 100,
      }));
      return;
    }
    const video = videoRef.current;
    if (!video) return;
    channel.send(JSON.stringify({
      framecast: 'video-state',
      fullscreen: isVideoFullscreen(video),
      currentTime: phoneVideoStateRef.current?.currentTime ?? video.currentTime,
      duration: phoneVideoStateRef.current?.duration ?? (Number.isFinite(video.duration) ? video.duration : 0),
      paused: phoneVideoStateRef.current?.paused ?? video.paused,
      ended: video.ended,
      volume: video.muted ? 0 : video.volume,
      fitMode: videoFitModeRef.current,
    }));
  }, []);

  useEffect(() => {
    let active = true, busy = false;
    let unavailableFor: RTCPeerConnection | null = null;
    const reportDecoder = async () => {
      const peer = peerRef.current;
      const channel = controlChannelRef.current;
      if (busy || !phoneRenderedVideoRef.current || !peer || peer === unavailableFor || channel?.readyState !== 'open') return;
      busy = true;
      try {
        const report = await peer.getStats();
        if (!active || peerRef.current !== peer || controlChannelRef.current !== channel || channel.readyState !== 'open') return;
        const stats = readVideoStats(report, 'inbound');
        if (stats) channel.send(JSON.stringify({ framecast: 'video-health', ...stats }));
      } catch (error) {
        if (active && peerRef.current === peer) {
          console.warn('TV decoder statistics unavailable; playback remains active.', error);
          unavailableFor = peer;
        }
      } finally { busy = false; }
    };
    const timer = window.setInterval(() => { void reportDecoder(); }, 2000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  const handleYouTubeReady = useCallback((player: YouTubePlayerApi) => {
    youtubePlayerRef.current = player;
    player.mute();
    player.playVideo();
    setMuted(true);
    setError('');
    setPlaying(false);
    if (youtubeMediaChannelRef.current?.readyState === 'open') {
      youtubeMediaChannelRef.current.send(JSON.stringify({ framecast: 'streaming' }));
    }
    sendVideoState();
  }, [sendVideoState]);

  const handleYouTubeStateChange = useCallback((player: YouTubePlayerApi, state: number) => {
    void player;
    setPlaying(state === 1);
    if (state === 1) {
      setError('');
      if (youtubeMediaChannelRef.current?.readyState === 'open') {
        youtubeMediaChannelRef.current.send(JSON.stringify({ framecast: 'streaming' }));
      }
    }
    sendVideoState();
  }, [sendVideoState]);

  const handleYouTubeError = useCallback((code: number) => {
    const message = code === 101 || code === 150
      ? 'This YouTube video does not allow playback in an embedded player.'
      : 'YouTube could not play this video. It may be unavailable, private, or restricted.';
    setError(message);
    if (youtubeMediaChannelRef.current?.readyState === 'open') {
      youtubeMediaChannelRef.current.send(JSON.stringify({ framecast: 'stream-error', message }));
    }
  }, []);

  const handleYouTubeAutoplayBlocked = useCallback(() => {
    setError('The TV browser blocked automatic YouTube playback. Press Play in the YouTube player on the TV.');
    if (youtubeMediaChannelRef.current?.readyState === 'open') {
      youtubeMediaChannelRef.current.send(JSON.stringify({ framecast: 'streaming' }));
    }
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const update = () => sendVideoState();
    const events = ['timeupdate', 'play', 'pause', 'ended', 'durationchange', 'volumechange', 'seeked', 'loadedmetadata'];
    for (const eventName of events) video.addEventListener(eventName, update);
    return () => {
      for (const eventName of events) video.removeEventListener(eventName, update);
    };
  }, [sendVideoState]);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onPlaying = () => {
      if (video.readyState < 2 || !video.videoWidth || !video.videoHeight || video.paused) return;
      if (playlistTransitioningRef.current) {
        setVideoReturnedInline(false);
        finishPlaylistTransition();
      }
      if (phoneRenderedVideoRef.current && phoneVideoStateRef.current?.paused) relayPhoneVideoCommand('play');
      const channel = videoMediaChannelRef.current;
      if (channel?.readyState === 'open') channel.send(JSON.stringify({ framecast: 'streaming' }));
      if (screenMirroringRef.current) {
        setNeedsVideoFullscreen(false);
        sendVideoState();
        return;
      }
      const source = video.srcObject || video.currentSrc || video.src;
      if (isVideoFullscreen(video)) { autoFullscreen.observe(true); sendVideoState(); return; }
      void autoFullscreen.start(source, {
        ready: () => video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0 && !video.paused,
        request: () => {
          setVideoReturnedInline(false);
          applyVideoOrientation();
          return requestPlaybackFullscreen(video);
        },
        onResult: (entered) => { setNeedsVideoFullscreen(!entered); sendVideoState(); },
      });
    };
    let correctingNativeFullscreen = false;
    const correctNativeFullscreen = () => {
      if (!canvasPlaybackRef.current || correctingNativeFullscreen) return;
      correctingNativeFullscreen = true;
      // A TV hardware overlay can bypass our rotation transform despite playsInline.
      void exitVideoFullscreen(video)
        .then(() => requestPlaybackFullscreen(video))
        .then((entered) => setNeedsVideoFullscreen(!entered))
        .finally(() => { correctingNativeFullscreen = false; });
    };
    const onExit = () => {
      const fullscreen = isVideoFullscreen(video);
      if (fullscreen && document.fullscreenElement === video && canvasPlaybackRef.current) {
        correctNativeFullscreen();
        return;
      }
      if (playlistTransitioningRef.current) {
        setBrowserFullscreen(fullscreen);
        autoFullscreen.observe(fullscreen);
        setVideoReturnedInline(false);
        setNeedsVideoFullscreen(false);
        revealTvControls();
        return;
      }
      setBrowserFullscreen(fullscreen);
      autoFullscreen.observe(fullscreen);
      setVideoReturnedInline(!fullscreen);
      if (mediaKind === 'image') setPhotoReturnedInline(!fullscreen);
      // Do not re-enter on pause/resume or buffering after the viewer presses Back.
      setNeedsVideoFullscreen(false);
      revealTvControls();
    };
    video.addEventListener('playing', onPlaying);
    const onLiveFrame = () => { if (phoneRenderedVideoRef.current && video.readyState >= 2 && !video.paused) onPlaying(); };
    video.addEventListener('loadeddata', onLiveFrame);
    video.addEventListener('resize', onLiveFrame);
    video.addEventListener('loadedmetadata', applyVideoOrientation);
    video.addEventListener('resize', applyVideoOrientation);
    video.addEventListener('webkitendfullscreen', onExit);
    const onBegin = () => { correctNativeFullscreen(); autoFullscreen.observe(isVideoFullscreen(video)); sendVideoState(); };
    video.addEventListener('webkitbeginfullscreen', onBegin);
    document.addEventListener('fullscreenchange', onExit);
    document.addEventListener('webkitfullscreenchange', onExit);
    return () => {
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('loadeddata', onLiveFrame);
      video.removeEventListener('resize', onLiveFrame);
      video.removeEventListener('loadedmetadata', applyVideoOrientation);
      video.removeEventListener('resize', applyVideoOrientation);
      video.removeEventListener('webkitendfullscreen', onExit);
      video.removeEventListener('webkitbeginfullscreen', onBegin);
      document.removeEventListener('fullscreenchange', onExit);
      document.removeEventListener('webkitfullscreenchange', onExit);
    };
  }, [revealTvControls, mediaKind, applyVideoOrientation, requestPlaybackFullscreen, autoFullscreen, sendVideoState, finishPlaylistTransition]);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onPause = () => {
      if (phoneRenderedVideoRef.current && phoneVideoStateRef.current && !phoneVideoStateRef.current.paused) relayPhoneVideoCommand('pause');
    };
    video.addEventListener('pause', onPause);
    return () => video.removeEventListener('pause', onPause);
  }, [relayPhoneVideoCommand]);
  useEffect(() => {
    if (mediaKind !== 'image' || status !== 'connected') return;
    const onPhotoRemote = (event: KeyboardEvent) => {
      if ((['Escape', 'Backspace', 'BrowserBack'].includes(event.key) || event.keyCode === 10009) && isVideoFullscreen(videoRef.current!)) {
        event.preventDefault();
        void exitVideoFullscreen(videoRef.current!);
      } else if ((event.key === 'Enter' || event.keyCode === 13) && needsPhotoFullscreen && playbackStageRef.current) {
        if ((event.target as HTMLElement | null)?.closest('button, input, a')) return;
        event.preventDefault();
        void requestMediaFullscreen(playbackStageRef.current).then((entered) => setNeedsPhotoFullscreen(!entered));
      }
    };
    document.addEventListener('keydown', onPhotoRemote);
    return () => document.removeEventListener('keydown', onPhotoRemote);
  }, [mediaKind, status, needsPhotoFullscreen]);
  useEffect(() => {
    if (status !== 'connected' || mediaKind !== 'video' || youtubeVideoId) return;
    const video = videoRef.current;
    if (!video) return;
    const onRemoteKey = (event: KeyboardEvent) => {
      const back = ['Escape', 'Backspace', 'BrowserBack'].includes(event.key) || event.keyCode === 10009;
      if (back && isVideoFullscreen(video)) {
        event.preventDefault();
        void exitVideoFullscreen(video);
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target && ['BUTTON', 'INPUT', 'A'].includes(target.tagName)) return;
      if (needsVideoFullscreen && (event.key === 'Enter' || event.keyCode === 13)) {
        event.preventDefault();
        applyVideoOrientation();
        void requestPlaybackFullscreen(video).then((entered) => { setNeedsVideoFullscreen(!entered); sendVideoState(); });
        return;
      }
      const play = event.key === 'MediaPlay' || event.keyCode === 415;
      const pause = event.key === 'MediaPause' || event.keyCode === 19;
      const toggle = ['Enter', 'MediaPlayPause', ' '].includes(event.key) || event.keyCode === 10252;
      if (phoneRenderedVideoRef.current) {
        const action = play ? 'play' : pause ? 'pause' : toggle
          ? (phoneVideoStateRef.current?.paused ? 'play' : 'pause')
          : event.key === 'ArrowLeft' || event.keyCode === 412 ? 'video:seek-by:-10'
          : event.key === 'ArrowRight' || event.keyCode === 417 ? 'video:seek-by:10'
          : event.key === 'MediaStop' || event.keyCode === 413 ? 'stop' : '';
        if (action) {
          event.preventDefault();
          relayPhoneVideoCommand(action);
          if (action === 'play' && needsVideoFullscreen) void requestPlaybackFullscreen(video).then((entered) => setNeedsVideoFullscreen(!entered));
        }
        return;
      }
      if (play || pause || toggle) {
        event.preventDefault();
        if (pause || (toggle && !video.paused)) video.pause();
        else {
          void video.play().catch(() => setPlaying(false));
          // This call is inside a real TV remote gesture, not a phone message.
          if (needsVideoFullscreen) void requestPlaybackFullscreen(video).then((entered) => setNeedsVideoFullscreen(!entered));
        }
      } else if (event.key === 'ArrowLeft' || event.keyCode === 412) {
        event.preventDefault();
        video.currentTime = Math.max(0, video.currentTime - 10);
      } else if (event.key === 'ArrowRight' || event.keyCode === 417) {
        event.preventDefault();
        video.currentTime = Math.min(video.duration || Infinity, video.currentTime + 10);
      } else if (event.key === 'MediaStop' || event.keyCode === 413) {
        event.preventDefault();
        video.pause();
        video.currentTime = 0;
      }
    };
    document.addEventListener('keydown', onRemoteKey);
    return () => document.removeEventListener('keydown', onRemoteKey);
  }, [status, mediaKind, youtubeVideoId, needsVideoFullscreen, requestPlaybackFullscreen]);
  useEffect(() => {
    if (!youtubeVideoId) return;
    const timer = window.setInterval(sendVideoState, 750);
    return () => window.clearInterval(timer);
  }, [youtubeVideoId, sendVideoState]);

  useEffect(() => () => stopPeer(), [stopPeer]);
  useEffect(() => {
    if (status === 'connected') {
      lastTvActivityRef.current = 0;
      revealTvControls();
    } else {
      if (tvControlsIntervalRef.current !== null) window.clearInterval(tvControlsIntervalRef.current);
      tvControlsIntervalRef.current = null;
      tvControlsVisibleRef.current = true;
      setTvControlsVisible(true);
      setTvControlsCountdown(null);
    }
    return () => {
      if (tvControlsIntervalRef.current !== null) window.clearInterval(tvControlsIntervalRef.current);
      tvControlsIntervalRef.current = null;
    };
  }, [status, revealTvControls]);
  useEffect(() => {
    const onActivity = () => revealTvControls();
    window.addEventListener('keydown', onActivity);
    window.addEventListener('focus', onActivity);
    document.addEventListener('pointerdown', onActivity, { passive: true });
    document.addEventListener('pointermove', onActivity, { passive: true });
    document.addEventListener('mousemove', onActivity, { passive: true });
    document.addEventListener('touchstart', onActivity, { passive: true });
    document.addEventListener('click', onActivity);
    document.addEventListener('focusin', onActivity);
    return () => {
      window.removeEventListener('keydown', onActivity);
      window.removeEventListener('focus', onActivity);
      document.removeEventListener('pointerdown', onActivity);
      document.removeEventListener('pointermove', onActivity);
      document.removeEventListener('mousemove', onActivity);
      document.removeEventListener('touchstart', onActivity);
      document.removeEventListener('click', onActivity);
      document.removeEventListener('focusin', onActivity);
    };
  }, [revealTvControls]);
  useEffect(() => {
    const video = videoRef.current;
    const updateFullscreenState = () => {
      setBrowserFullscreen(video ? isVideoFullscreen(video) : Boolean(document.fullscreenElement));
      sendVideoState();
    };
    const documentEvents = ['fullscreenchange', 'webkitfullscreenchange'];
    const videoEvents = ['webkitbeginfullscreen', 'webkitendfullscreen', 'webkitpresentationmodechanged'];
    for (const event of documentEvents) document.addEventListener(event, updateFullscreenState);
    for (const event of videoEvents) video?.addEventListener(event, updateFullscreenState);
    updateFullscreenState();
    return () => {
      for (const event of documentEvents) document.removeEventListener(event, updateFullscreenState);
      for (const event of videoEvents) video?.removeEventListener(event, updateFullscreenState);
    };
  }, [sendVideoState]);
  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 15000);
    return () => window.clearInterval(timer);
  }, []);

  const toggleBrowserFullscreen = () => {
    const video = videoRef.current;
    if (status === 'connected' && hasActiveTvMedia && mediaKind === 'video' && !youtubeVideoId && video) {
      if (isVideoFullscreen(video)) void exitVideoFullscreen(video);
      else {
        setVideoReturnedInline(false);
        void requestPlaybackFullscreen(video).then((entered) => setNeedsVideoFullscreen(!entered));
      }
      return;
    }
    if (status === 'connected' && hasActiveTvMedia && mediaKind === 'image' && playbackStageRef.current) {
      if (video && isVideoFullscreen(video)) void exitVideoFullscreen(video);
      else {
        setPhotoReturnedInline(false);
        void requestMediaFullscreen(playbackStageRef.current).then((entered) => setNeedsPhotoFullscreen(!entered));
      }
      return;
    }
    const fullscreenDocument = document as Document & {
      webkitFullscreenElement?: Element | null;
      webkitCurrentFullScreenElement?: Element | null;
      webkitIsFullScreen?: boolean;
      webkitExitFullscreen?: () => void | Promise<void>;
      webkitCancelFullScreen?: () => void | Promise<void>;
    };
    if (document.fullscreenElement || fullscreenDocument.webkitFullscreenElement
      || fullscreenDocument.webkitCurrentFullScreenElement || fullscreenDocument.webkitIsFullScreen) {
      const exit = document.exitFullscreen ?? fullscreenDocument.webkitExitFullscreen ?? fullscreenDocument.webkitCancelFullScreen;
      if (exit) {
        void Promise.resolve(exit.call(document)).catch(() => {
          setError('This TV browser could not exit full screen. Use its Back or Exit key.');
        });
      } else {
        setError('This TV browser could not exit full screen. Use its Back or Exit key.');
      }
      setNeedsStandbyFullscreen(false);
      return;
    }
    void requestMediaFullscreen(document.documentElement).then((entered) => {
      setBrowserFullscreen(entered);
      setNeedsStandbyFullscreen(!entered);
    });
  };
  useEffect(() => {
    if (!createdRoom) return;
    finishPlaylistTransition();
    resumeAfterRef.current = 0;
    setRoom(createdRoom);
    setStatus('idle');
    seenRef.current.clear();
    queuedCandidates.current = [];
  }, [createdRoom, finishPlaylistTransition]);
  useEffect(() => {
    if (!room && !creatingRoom && !createdRoom && !createRoomError) {
      createRoomRef.current();
    }
  }, [room, creatingRoom, createdRoom, createRoomError]);
  useEffect(() => {
    if (createRoomError) setError('A pairing room could not be created. Check your connection and try again.');
  }, [createRoomError]);

  const serverExpiry = messagesQuery.data?.expiresAt;
  useEffect(() => {
    if (!roomId || !serverExpiry) return;
    setRoom((current) => current?.id === roomId && current.expiresAt !== serverExpiry
      ? { ...current, expiresAt: serverExpiry }
      : current);
  }, [roomId, serverExpiry]);

  useEffect(() => {
    if (!roomId) return;
    for (const signal of messages) {
      if (signal.from !== 'phone' || signal.sequence <= resumeAfterRef.current || seenRef.current.has(signal.sequence)) continue;
      seenRef.current.add(signal.sequence);
      if (signal.type === 'local-video') {
        try {
          const target = new URL(String(signal.payload.receiverUrl));
          if (target.protocol !== 'http:' || target.username || target.password
            || !/^(10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/.test(target.hostname)
            || target.hostname.split('.').some((part) => Number(part) > 255)
            || !/^\/[a-z0-9]+\/receiver[.]html$/.test(target.pathname)) throw new Error();
          sessionStorage.setItem('framecast-tv-resume', JSON.stringify(room));
          const config = {
            endpoint: `${window.location.origin}/api/cast/rooms/${roomId}/messages`,
            returnUrl: window.location.href,
            after: signal.sequence,
            sessionId: signal.payload.sessionId,
            extension: signal.payload.extension,
          };
          window.location.href = `${target.href}#${encodeURIComponent(JSON.stringify(config))}`;
          return;
        } catch {
          send('tv', 'player-state', {
            sessionId: signal.payload.sessionId,
            playback: 'error',
            message: 'TV_LOCAL_RECEIVER_UNSUPPORTED',
          });
          setError('The phone supplied an invalid local playback address. Reconnect it to your home Wi-Fi and try again.');
        }
      } else if (signal.type === 'ready') {
        finishPlaylistTransition();
        const connectionState = peerRef.current?.connectionState;
        if (!peerRef.current || connectionState === 'failed' || connectionState === 'disconnected' || connectionState === 'closed') {
          if (peerRef.current) {
            stopPeer();
          }
          setError('');
          setStatus('paired');
        }
      } else if (signal.type === 'offer') {
        void (async () => {
          let offerPeer: RTCPeerConnection | null = null;
          try {
            setError('');
            setMediaKind(signal.payload.mediaKind === 'image' ? 'image' : 'video');
            stopPeer();
            const isScreenMirror = signal.payload.mediaSource === 'screen';
            screenMirroringRef.current = isScreenMirror;
            setScreenMirroring(isScreenMirror);
            const peer = new RTCPeerConnection(rtcConfig);
            offerPeer = peer;
            peerRef.current = peer;
            const sessionId = typeof signal.payload.sessionId === 'string' ? signal.payload.sessionId : undefined;
            activeSessionRef.current = sessionId ?? null;
            peer.ondatachannel = (event) => {
              if (peerRef.current !== peer) { event.channel.close(); return; }
              const channel = event.channel;
              if (channel.label === 'framecast-screen-audio') {
                const audioPlayer = createScreenMirrorAudioPlayer();
                screenMirrorAudioRef.current = audioPlayer;
                channel.binaryType = 'arraybuffer';
                channel.onmessage = (message) => {
                  if (peerRef.current === peer) audioPlayer?.push(message.data);
                };
                channel.onclose = () => {
                  if (screenMirrorAudioRef.current === audioPlayer) {
                    audioPlayer?.close();
                    screenMirrorAudioRef.current = null;
                  }
                };
              } else if (channel.label === 'framecast-media') {
                videoMediaChannelRef.current = channel;
                channel.binaryType = 'arraybuffer';
                channel.onmessage = (message) => {
                  if (peerRef.current !== peer) return;
                  if (typeof message.data === 'string') {
                    let packet: { framecast?: string; name?: string; itemId?: string; previewDataUrl?: string; mimeType?: string; kind?: MediaKind; size?: number; sizeUnknown?: boolean; streamCandidate?: boolean; url?: string; rotation?: number; encodedWidth?: number; encodedHeight?: number; orientationNormalized?: boolean };
                    try {
                      packet = JSON.parse(message.data) as { framecast?: string; name?: string; itemId?: string; previewDataUrl?: string; mimeType?: string; kind?: MediaKind; size?: number; streamCandidate?: boolean; url?: string };
                    } catch {
                      setError('The phone sent an unreadable media transfer message.');
                      return;
                    }
                    if (packet.framecast === 'receiver-info') {
                      if (channel.readyState === 'open') channel.send(JSON.stringify({ framecast: 'receiver-info', rotationRenderer: ROTATION_RENDERER_VERSION }));
                      return;
                    }
                    if (packet.framecast === 'live-video') {
                      const video = videoRef.current;
                      if (phoneRenderedVideoRef.current && video) {
                        setTransferProgress(100);
                        setVideoStreamActive(true);
                        if (!video.paused && video.readyState >= 2 && video.videoWidth && video.videoHeight) channel.send(JSON.stringify({ framecast: 'streaming' }));
                        else void startReceiverVideo(video, {
                          onPlaying: () => { if (channel.readyState === 'open' && video.videoWidth && video.videoHeight) channel.send(JSON.stringify({ framecast: 'streaming' })); },
                          onBlocked: () => { if (channel.readyState === 'open') channel.send(JSON.stringify({ framecast: 'playback-blocked', message: 'Press Play with the TV remote. Your phone is connected.' })); },
                          onFailed: () => { if (channel.readyState === 'open') channel.send(JSON.stringify({ framecast: 'stream-error', message: 'The TV could not open the direct video stream.' })); },
                        });
                      }
                      return;
                    }
                    if (packet.framecast === 'preview' && packet.kind === 'image' && packet.itemId && packet.previewDataUrl) {
                      const blob = photoPreviewBlob(packet.previewDataUrl);
                      if (blob) {
                        const url = URL.createObjectURL(blob);
                        mediaObjectUrlsRef.current.push(url);
                        const currentImages = receivedImagesRef.current;
                        const existingIndex = currentImages.findIndex((image) => image.itemId === packet.itemId);
                        const preview = { url, name: packet.name || 'Photo preview', itemId: packet.itemId };
                        const nextImages = existingIndex >= 0
                          ? currentImages.map((image, index) => index === existingIndex ? preview : image)
                          : [...currentImages, preview];
                        receivedImagesRef.current = nextImages;
                        setReceivedImages(nextImages);
                        if (currentImages.length === 0) setPhotoPreviewVisible(true);
                        setTransferProgress(0);
                      }
                      return;
                    }
                    if (packet.framecast === 'remote-video' && packet.url) {
                      let videoUrl: URL;
                      try {
                        videoUrl = new URL(packet.url);
                        if (videoUrl.protocol !== 'https:' && videoUrl.protocol !== 'http:') throw new Error('Unsupported URL protocol');
                      } catch {
                        const messageText = 'Use a video link that starts with http:// or https://.';
                        setError(messageText);
                        if (channel.readyState === 'open') channel.send(JSON.stringify({ framecast: 'stream-error', message: messageText }));
                        return;
                      }
                      const youtubeId = getYouTubeVideoId(videoUrl.href);
                      if (youtubeId) {
                        const video = videoRef.current;
                        if (video) {
                          video.pause();
                          video.srcObject = null;
                          video.removeAttribute('src');
                          video.load();
                        }
                        youtubePlayerRef.current = null;
                        youtubeMediaChannelRef.current = channel;
                        setYoutubeVideoId(youtubeId);
                        setError('');
                        setMediaKind('video');
                        setTransferProgress(100);
                        setPhotoPreviewVisible(false);
                        setPlaying(false);
                        setVideoStreamActive(false);
                        return;
                      }
                      youtubePlayerRef.current = null;
                      youtubeMediaChannelRef.current = null;
                      setYoutubeVideoId(null);
                      const video = videoRef.current;
                      if (!video) {
                        const messageText = 'The TV browser could not open its video player.';
                        setError(messageText);
                        if (channel.readyState === 'open') channel.send(JSON.stringify({ framecast: 'stream-error', message: messageText }));
                        return;
                      }
                      const failRemoteVideo = (messageText: string) => {
                        setError(messageText);
                        setVideoStreamActive(false);
                        if (channel.readyState === 'open') {
                          channel.send(JSON.stringify({ framecast: 'stream-error', message: messageText }));
                        }
                      };
                      setError('');
                      setMediaKind('video');
                      setTransferProgress(100);
                      setPhotoPreviewVisible(false);
                      setPlaying(false);
                      setVideoStreamActive(true);
                      video.pause();
                      video.srcObject = null;
                      video.removeAttribute('src');
                      video.muted = true;
                      video.src = videoUrl.href;
                      video.addEventListener('error', () => {
                        failRemoteVideo('The TV could not load this video link. The source may block TV playback or require sign-in.');
                      }, { once: true });
                      video.addEventListener('canplay', () => {
                        void startReceiverVideo(video, {
                          onPlaying: () => {
                            setPlaying(true);
                            if (channel.readyState === 'open') channel.send(JSON.stringify({ framecast: 'streaming' }));
                          },
                          onBlocked: () => {
                            setError('Press Play with the TV remote to start the video.');
                            if (channel.readyState === 'open') channel.send(JSON.stringify({ framecast: 'playback-blocked', message: 'Press Play with the TV remote to start the video. Your phone is still connected.' }));
                          },
                          onFailed: () => failRemoteVideo('The TV player could not start this video link. Check the source or try another video.'),
                        });
                      }, { once: true });
                      video.load();
                      return;
                    }
                    if (packet.framecast === 'metadata') {
                      orientationSourceRef.current = packet.kind !== 'image' && Number.isFinite(packet.rotation)
                        ? { rotation: packet.rotation!, encodedWidth: packet.encodedWidth || 0, encodedHeight: packet.encodedHeight || 0, orientationNormalized: packet.orientationNormalized === true } : null;
                      manualRotationRef.current = 0;
                      applyVideoOrientation();
                      youtubePlayerRef.current = null;
                      youtubeMediaChannelRef.current = null;
                      setYoutubeVideoId(null);
                      const kind: MediaKind = packet.kind === 'image' ? 'image' : 'video';
                      const sizeLimit = kind === 'video' ? MAX_VIDEO_SIZE_BYTES : MAX_MEDIA_SIZE_BYTES;
                      if (!packet.size || packet.size > sizeLimit || !packet.mimeType) {
                        setError('This file is too large or has an unsupported format.');
                        channel.close();
                        return;
                      }
                      let streamMode = kind === 'video';
                      if (kind === 'video') {
                        const streamError = 'This video cannot stream immediately and is too large for safe buffering. Use a stream-ready H.264/AAC fragmented MP4 or a video under 128 MB.';
                        if (!packet.streamCandidate || typeof MediaSource === 'undefined' || !MediaSource.isTypeSupported) {
                          if (packet.size > BUFFERED_VIDEO_FALLBACK_MAX_BYTES) {
                            setError(streamError);
                            setStatus('failed');
                            if (channel.readyState === 'open') channel.send(JSON.stringify({ framecast: 'stream-error', message: streamError }));
                            window.setTimeout(() => stopPeer(), 1200);
                            return;
                          }
                          streamMode = false;
                          setError('');
                          if (channel.readyState === 'open') {
                            channel.send(JSON.stringify({ framecast: 'buffered', message: 'This video will play after it finishes sending to the TV.' }));
                          }
                        }
                        const video = videoRef.current;
                        if (!video) {
                          const messageText = 'The TV browser could not open its video player. Refresh the TV page and try again.';
                          setError(messageText);
                          if (channel.readyState === 'open') channel.send(JSON.stringify({ framecast: 'stream-error', message: messageText }));
                          return;
                        }
                        if (streamMode && video) {
                        const mediaSource = new MediaSource();
                        const url = URL.createObjectURL(mediaSource);
                        mediaObjectUrlsRef.current.push(url);
                        video.pause();
                        video.srcObject = null;
                        video.removeAttribute('src');
                        video.muted = true;
                        setMuted(true);
                        video.src = url;
                        video.load();
                        const parser = createFile() as unknown as Mp4ParserLike;
                        const failVideoStream = (messageText: string) => {
                          const active = videoStreamRef.current;
                          if (active) {
                            active.failed = true;
                            window.clearTimeout(active.initTimer);
                          }
                          setError(messageText);
                          setStatus('failed');
                          setVideoStreamActive(false);
                          if (channel.readyState === 'open') {
                            channel.send(JSON.stringify({ framecast: 'stream-error', message: messageText }));
                          }
                          window.setTimeout(() => stopPeer(), 1200);
                        };
                        const session: VideoStreamSession = {
                          mediaSource,
                          url,
                          parser,
                          sourceBuffer: null,
                          initialChunks: [],
                          appendQueue: [],
                          fileOffset: 0,
                          initialized: false,
                          complete: false,
                          failed: false,
                          initTimer: 0,
                          fail: failVideoStream,
                        };
                        const fallbackToBufferedVideo = (messageText: string) => {
                          if (session.failed) return;
                          if (session.initialized) {
                            failVideoStream(messageText);
                            return;
                          }
                          const transfer = mediaTransferRef.current;
                          if (!transfer || transfer.size > BUFFERED_VIDEO_FALLBACK_MAX_BYTES) {
                            failVideoStream('This video is not stream-ready and is too large for safe TV buffering. Use a stream-ready H.264/AAC fragmented MP4 or a video under 128 MB.');
                            return;
                          }
                          session.failed = true;
                          window.clearTimeout(session.initTimer);
                          transfer.streamMode = false;
                          transfer.chunks.push(...session.initialChunks);
                          session.initialChunks = [];
                          videoStreamRef.current = null;
                          setVideoStreamActive(false);
                          setPlaying(false);
                          setError('');
                          video.pause();
                          video.removeAttribute('src');
                          video.load();
                          URL.revokeObjectURL(session.url);
                          mediaObjectUrlsRef.current = mediaObjectUrlsRef.current.filter((objectUrl) => objectUrl !== session.url);
                          if (channel.readyState === 'open') {
                            channel.send(JSON.stringify({ framecast: 'buffered', message: 'This video will play after it finishes sending to the TV.' }));
                          }
                        };
                        session.fail = fallbackToBufferedVideo;
                        videoStreamRef.current = session;
                        setVideoStreamActive(true);
                        video.addEventListener('error', () => {
                          if (!session.failed) failVideoStream('The TV browser rejected this video stream. Try a stream-ready H.264/AAC fragmented MP4.');
                        }, { once: true });
                        const initializeSourceBuffer = () => {
                          if (session.failed || session.initialized || !session.info || mediaSource.readyState !== 'open') return;
                          if (!session.info.isFragmented) {
                            fallbackToBufferedVideo('This video is not fragmented for instant streaming.');
                            return;
                          }
                          const tracks = session.info.tracks.filter((track) => track.video || track.audio);
                          const hasVideo = tracks.some((track) => track.video);
                          const codecs = tracks.map((track) => track.codec).filter((codec): codec is string => Boolean(codec));
                          const contentType = `video/mp4; codecs="${codecs.join(',')}"`;
                          if (!hasVideo || codecs.length === 0 || !MediaSource.isTypeSupported(contentType)) {
                            fallbackToBufferedVideo('The TV cannot stream this video codec immediately.');
                            return;
                          }
                          try {
                            const sourceBuffer = mediaSource.addSourceBuffer(contentType);
                            session.sourceBuffer = sourceBuffer;
                            session.initialized = true;
                            window.clearTimeout(session.initTimer);
                            sourceBuffer.addEventListener('updateend', () => drainVideoStream(session, video));
                            sourceBuffer.addEventListener('error', () => failVideoStream('The TV browser rejected part of the video stream. Try a standard H.264/AAC fragmented MP4.'));
                            video.addEventListener('canplay', () => {
                              void startReceiverVideo(video, {
                                onPlaying: () => {
                                  setPlaying(true);
                                  if (channel.readyState === 'open') channel.send(JSON.stringify({ framecast: 'streaming' }));
                                },
                                onBlocked: () => {
                                  setError('Press Play with the TV remote to start the video.');
                                  if (channel.readyState === 'open') channel.send(JSON.stringify({ framecast: 'playback-blocked', message: 'Press Play with the TV remote to start the video. Your phone is still connected.' }));
                                },
                                onFailed: () => failVideoStream('The TV player could not start this video stream. Try another video or the standard TV player.'),
                              });
                            }, { once: true });
                            session.appendQueue.push(...session.initialChunks);
                            session.initialChunks = [];
                            drainVideoStream(session, video);
                          } catch {
                            fallbackToBufferedVideo('The TV browser cannot stream this video format immediately.');
                          }
                        };
                        parser.onReady = (info) => {
                          session.info = info;
                          initializeSourceBuffer();
                        };
                        parser.onError = () => fallbackToBufferedVideo('The video could not be opened as an instant stream.');
                        mediaSource.addEventListener('sourceopen', initializeSourceBuffer, { once: true });
                        if (mediaSource.readyState === 'open') initializeSourceBuffer();
                        session.initTimer = window.setTimeout(
                          () => fallbackToBufferedVideo('This video did not provide a stream header quickly.'),
                          12_000,
                        );
                      }
                      }
                      mediaTransferRef.current = {
                        name: packet.name || `Photo ${receivedImagesRef.current.length + 1}`,
                        itemId: packet.itemId,
                        mimeType: packet.mimeType,
                        kind,
                        size: packet.size,
                        sizeUnknown: packet.sizeUnknown,
                        received: 0,
                        chunks: [],
                        streamMode,
                      };
                      setMediaKind(kind);
                      setTransferProgress(0);
                      return;
                    }
                    if (packet.framecast === 'complete') {
                      const transfer = mediaTransferRef.current;
                      if (!transfer || (!transfer.sizeUnknown && transfer.received !== transfer.size) || (transfer.sizeUnknown && transfer.received === 0)) {
                        setError('The media transfer was incomplete. Send the file again.');
                        return;
                      }
                      if (transfer.kind === 'video' && transfer.streamMode) {
                        const stream = videoStreamRef.current;
                        if (stream && !stream.initialized && !stream.failed) {
                          stream.fail('The video did not become stream-ready before transfer completed.');
                        }
                        if (transfer.streamMode && (!stream || !stream.initialized || stream.failed)) {
                          setError('The TV could not start this video as a live stream. Choose a stream-ready H.264/AAC fragmented MP4.');
                          return;
                        }
                        if (transfer.streamMode && stream) {
                          stream.complete = true;
                          mediaTransferRef.current = null;
                          setTransferProgress(100);
                          if (videoRef.current) drainVideoStream(stream, videoRef.current);
                          return;
                        }
                      }
                      const url = URL.createObjectURL(new Blob(transfer.chunks, { type: transfer.mimeType }));
                      mediaObjectUrlsRef.current.push(url);
                      if (transfer.kind === 'image') {
                        if (videoRef.current) {
                          videoRef.current.srcObject = null;
                          videoRef.current.removeAttribute('src');
                          videoRef.current.load();
                        }
                        const existingIndex = transfer.itemId
                          ? receivedImagesRef.current.findIndex((image) => image.itemId === transfer.itemId)
                          : -1;
                        if (existingIndex >= 0) {
                          const existing = receivedImagesRef.current[existingIndex];
                          URL.revokeObjectURL(existing.url);
                          mediaObjectUrlsRef.current = mediaObjectUrlsRef.current.filter((objectUrl) => objectUrl !== existing.url);
                          const updatedImages = receivedImagesRef.current.map((image, index) => index === existingIndex
                            ? { url, name: transfer.name, itemId: transfer.itemId }
                            : image);
                          receivedImagesRef.current = updatedImages;
                          setReceivedImages(updatedImages);
                        } else {
                          const updatedImages = [...receivedImagesRef.current, { url, name: transfer.name, itemId: transfer.itemId }];
                          receivedImagesRef.current = updatedImages;
                          setReceivedImages(updatedImages);
                        }
                        setPhotoPreviewVisible(false);
                        setImageZoom(1);
                        if (channel.readyState === 'open') channel.send(JSON.stringify({ framecast: 'received', playback: 'displayed' }));
                      } else if (videoRef.current) {
                        receivedImagesRef.current = [];
                        setReceivedImages([]);
                        setCurrentImageIndex(0);
                        setPhotoPreviewVisible(false);
                        videoRef.current.pause();
                        videoRef.current.srcObject = null;
                        videoRef.current.removeAttribute('src');
                        videoRef.current.muted = true;
                        setMuted(true);
                        videoRef.current.src = url;
                        videoRef.current.load();
                        void videoRef.current.play().then(() => {
                          setPlaying(true);
                          if (channel.readyState === 'open') channel.send(JSON.stringify({ framecast: 'received', playback: 'playing' }));
                        }).catch((playError: unknown) => {
                          setPlaying(false);
                          if ((playError as { name?: string })?.name === 'NotAllowedError') {
                            const messageText = 'Press Play with the TV remote to start the video. Your phone is still connected.';
                            setError(messageText);
                            if (channel.readyState === 'open') channel.send(JSON.stringify({ framecast: 'playback-blocked', message: messageText }));
                            return;
                          }
                          setError('The TV received the video but could not play it. Try standard H.264 MP4 at 30 or 60 fps; some HEVC or high-frame-rate videos are not supported by TV browsers.');
                          if (channel.readyState === 'open') channel.send(JSON.stringify({ framecast: 'received', playback: 'failed' }));
                        });
                      }
                      mediaTransferRef.current = null;
                      setTransferProgress(100);
                    }
                    return;
                  }
                  const transfer = mediaTransferRef.current;
                  if (!transfer) return;
                  if (!(message.data instanceof ArrayBuffer)) return;
                  if (transfer.kind === 'video' && transfer.streamMode) {
                    const stream = videoStreamRef.current;
                    if (!stream || stream.failed) return;
                    const wasInitialized = stream.initialized;
                    if (wasInitialized) {
                      stream.appendQueue.push(message.data);
                    } else {
                      stream.initialChunks.push(message.data);
                      const initialBytes = stream.initialChunks.reduce((total, chunk) => total + chunk.byteLength, 0);
                      if (initialBytes > 4 * 1024 * 1024) {
                        stream.fail('The video has no small stream header at its start. Choose a stream-ready fragmented MP4.');
                        if (transfer.streamMode) return;
                      }
                      if (transfer.streamMode) {
                        const parserChunk = message.data.slice(0) as ArrayBuffer & { fileStart: number };
                        parserChunk.fileStart = stream.fileOffset;
                        stream.fileOffset += message.data.byteLength;
                        try {
                          stream.parser.appendBuffer(parserChunk);
                        } catch {
                          stream.fail('The TV could not parse this video as a live fragmented MP4 stream.');
                          if (transfer.streamMode) return;
                        }
                      }
                    }
                    if (stream.initialized && videoRef.current) drainVideoStream(stream, videoRef.current);
                  } else {
                    transfer.chunks.push(message.data);
                  }
                  transfer.received += message.data.byteLength;
                  if (transfer.size > 0) {
                    setTransferProgress(Math.min(99, Math.round((transfer.received / transfer.size) * 100)));
                  }
                };
              } else {
                controlChannelRef.current = channel;
                channel.onopen = sendVideoState;
                channel.onmessage = (message) => {
                  if (peerRef.current !== peer) return;
                  const command = String(message.data);
                  if (command === 'fullscreen:enter' || command === 'fullscreen:exit' || command === 'video:fullscreen') {
                    const video = videoRef.current;
                    const source = video?.srcObject || video?.currentSrc || video?.src;
                    const entering = command !== 'fullscreen:exit';
                    if (entering) autoFullscreen.allow(source);
                    else autoFullscreen.dismiss(source);
                    const request = entering
                      ? receiverMediaKindRef.current === 'image' || youtubePlayerRef.current
                        ? playbackStageRef.current ? requestMediaFullscreen(playbackStageRef.current) : Promise.resolve(false)
                        : video ? requestPlaybackFullscreen(video) : Promise.resolve(false)
                      : video ? exitVideoFullscreen(video) : Promise.resolve(false);
                    void request.then(() => {
                      if (peerRef.current !== peer || channel.readyState !== 'open') return;
                      const fullscreen = video ? isVideoFullscreen(video) : Boolean(document.fullscreenElement);
                      autoFullscreen.observe(fullscreen);
                      setBrowserFullscreen(fullscreen);
                      if (receiverMediaKindRef.current === 'image') setNeedsPhotoFullscreen(entering && !fullscreen);
                      else setNeedsVideoFullscreen(entering && !fullscreen);
                      channel.send(JSON.stringify({ framecast: 'fullscreen-state', fullscreen, needsGesture: entering && !fullscreen }));
                    });
                    return;
                  }
                  if (command.startsWith('{')) {
                    try {
                      const packet = JSON.parse(command) as { framecast?: string; nonce?: string };
                      if (packet.framecast === 'playlist-next-loading') {
                        beginPlaylistTransition(channel);
                        return;
                      }
                      if (packet.framecast === 'session-probe') {
                        if (channel.readyState === 'open') channel.send(JSON.stringify({ framecast: 'session-alive', nonce: packet.nonce }));
                        connectionGrace.cancel();
                        setError('');
                        setStatus('connected');
                        return;
                      }
                    } catch { /* Non-probe commands use the existing handlers. */ }
                  }
                  if (phoneRenderedVideoRef.current && command.startsWith('{')) {
                    try {
                      const packet = JSON.parse(command) as Partial<PhoneVideoState> & { framecast?: string };
                      if (packet.framecast === 'live-state' && Number.isFinite(packet.currentTime) && Number.isFinite(packet.duration) && typeof packet.paused === 'boolean') {
                        phoneVideoStateRef.current = packet as PhoneVideoState;
                        if (packet.fitMode === 'cover' || packet.fitMode === 'contain') {
                          videoFitModeRef.current = packet.fitMode;
                          setVideoFitMode(packet.fitMode);
                        }
                        const video = videoRef.current;
                        if (video) {
                          if (packet.paused && !video.paused) video.pause();
                          else if (!packet.paused && video.paused) void video.play().catch(() => setError('Press Play with the TV remote to resume.'));
                        }
                        setPlaying(!packet.paused);
                        sendVideoState();
                      }
                    } catch { setError('The phone sent unreadable playback information. Reconnect it.'); }
                    return;
                  }
                  if (phoneRenderedVideoRef.current && (['play', 'pause', 'stop'].includes(command) || command.startsWith('video:seek'))) {
                    relayPhoneVideoCommand(command);
                    return;
                  }
                  const youtube = youtubePlayerRef.current;
                  if (youtube) {
                    let handled = true;
                    if (command === 'pause') {
                      youtube.pauseVideo();
                      setPlaying(false);
                    } else if (command === 'play') {
                      youtube.playVideo();
                    } else if (command === 'stop') {
                      youtube.stopVideo();
                      setPlaying(false);
                    } else if (command.startsWith('video:seek-by:')) {
                      const offset = Number(command.slice('video:seek-by:'.length));
                      const duration = youtube.getDuration();
                      const current = youtube.getCurrentTime();
                      if (Number.isFinite(offset)) youtube.seekTo(Math.max(0, Math.min(duration || current + offset, current + offset)), true);
                    } else if (command.startsWith('video:seek:')) {
                      const targetTime = Number(command.slice('video:seek:'.length));
                      const duration = youtube.getDuration();
                      if (Number.isFinite(targetTime)) youtube.seekTo(Math.max(0, Math.min(duration || targetTime, targetTime)), true);
                    } else if (command.startsWith('video:volume:')) {
                      const volume = Number(command.slice('video:volume:'.length));
                      if (Number.isFinite(volume)) {
                        const normalized = Math.min(1, Math.max(0, volume));
                        youtube.setVolume(Math.round(normalized * 100));
                        if (normalized <= 0) youtube.mute();
                        else youtube.unMute();
                        setMuted(normalized <= 0);
                      }
                    } else if (command === 'video:mute') {
                      const nextMuted = !youtube.isMuted();
                      if (nextMuted) youtube.mute();
                      else youtube.unMute();
                      setMuted(nextMuted);
                    } else {
                      handled = false;
                    }
                    if (handled) {
                      sendVideoState();
                      return;
                    }
                  }
                  if (command === 'photo:next') {
                    setCurrentImageIndex((index) => Math.min(receivedImagesRef.current.length - 1, index + 1));
                    setImageZoom(1);
                    setImageOffsetY(0);
                  } else if (command === 'photo:previous') {
                    setCurrentImageIndex((index) => Math.max(0, index - 1));
                    setImageZoom(1);
                    setImageOffsetY(0);
                  } else if (command.startsWith('photo:show:')) {
                    const index = Number(command.slice('photo:show:'.length));
                    if (Number.isInteger(index) && index >= 0 && index < receivedImagesRef.current.length) {
                      setCurrentImageIndex(index);
                      setImageZoom(1);
                      setImageOffsetY(0);
                    }
                  } else if (command === 'photo:zoom-in') {
                    setImageZoom((zoom) => Math.min(4, Number((zoom + 0.25).toFixed(2))));
                  } else if (command === 'photo:zoom-out') {
                    setImageZoom((zoom) => Math.max(1, Number((zoom - 0.25).toFixed(2))));
                  } else if (command === 'photo:zoom-reset') {
                    setImageZoom(1);
                    setImageOffsetY(0);
                  } else if (command === 'photo:move-up') {
                    setImageOffsetY((offset) => Math.max(-1600, offset - 70));
                  } else if (command === 'photo:move-down') {
                    setImageOffsetY((offset) => Math.min(1600, offset + 70));
                  } else if (command === 'pause' && videoRef.current) {
                    videoRef.current.pause();
                    setPlaying(false);
                  } else if (command === 'play' && videoRef.current) {
                    void videoRef.current.play().catch(() => setPlaying(false));
                    setPlaying(true);
                  } else if (command === 'stop' && videoRef.current) {
                    videoRef.current.pause();
                    videoRef.current.currentTime = 0;
                    setPlaying(false);
                  } else if (command.startsWith('video:seek-by:') && videoRef.current) {
                    const offset = Number(command.slice('video:seek-by:'.length));
                    const video = videoRef.current;
                    if (Number.isFinite(offset) && Number.isFinite(video.duration)) {
                      video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + offset));
                    }
                  } else if (command.startsWith('video:seek:') && videoRef.current) {
                    const targetTime = Number(command.slice('video:seek:'.length));
                    const video = videoRef.current;
                    if (Number.isFinite(targetTime) && Number.isFinite(video.duration)) {
                      video.currentTime = Math.max(0, Math.min(video.duration, targetTime));
                    }
                  } else if (command.startsWith('video:volume:') && videoRef.current) {
                    const volume = Number(command.slice('video:volume:'.length));
                    if (Number.isFinite(volume)) {
                      videoRef.current.volume = Math.min(1, Math.max(0, volume));
                      videoRef.current.muted = volume <= 0;
                      setMuted(volume <= 0);
                    }
                  } else if (command === 'video:rotate') {
                    rotateCurrentVideo();
                  } else if (command === 'video:fit:cover' || command === 'video:fit:contain') {
                    changeVideoFit(command === 'video:fit:cover' ? 'cover' : 'contain');
                  } else if (command === 'video:mute' && videoRef.current) {
                    videoRef.current.muted = !videoRef.current.muted;
                    setMuted(videoRef.current.muted);
                  }
                };
              }
            };
            peer.ontrack = (event) => {
              if (peerRef.current !== peer) return;
              if (videoRef.current) {
                phoneRenderedVideoRef.current = true;
                orientationSourceRef.current = null;
                manualRotationRef.current = 0;
                videoRotationRef.current = 0;
                setVideoRotation(0);
                canvasPlaybackRef.current = false;
                setCanvasPlayback(false);
                setMediaKind('video');
                setVideoStreamActive(true);
                setTransferProgress(100);
                videoRef.current.playsInline = true;
                videoRef.current.setAttribute('webkit-playsinline', '');
                const stream = event.streams[0] ?? new MediaStream([event.track]);
                if (videoRef.current.srcObject !== stream) videoRef.current.srcObject = stream;
                void videoRef.current.play().catch(() => setPlaying(false));
              }
            };
            peer.onicecandidate = (event) => {
              if (peerRef.current === peer && event.candidate) send('tv', 'ice', { ...event.candidate.toJSON(), sessionId });
            };
            let connectedOnce = false;
            peer.onconnectionstatechange = () => {
              if (peerRef.current !== peer) return;
              if (peer.connectionState === 'connected') {
                connectedOnce = true;
                if (connectionGrace.interrupted) setError('');
                connectionGrace.cancel();
                setStatus('connected');
              }
              else if (peer.connectionState === 'disconnected') {
                connectionGrace.hold(() => {
                  if (peerRef.current !== peer || peer.connectionState === 'connected') return;
                  setStatus('disconnected');
                  setError('The phone is away. Pairing is kept; reopen FrameCast on the same phone to reconnect automatically.');
                });
              }
              else if (peer.connectionState === 'failed') {
                if (connectedOnce) {
                  connectionGrace.hold(() => {
                    if (peerRef.current !== peer || peer.connectionState === 'connected') return;
                    setStatus('disconnected');
                    setError('The phone is away. Pairing is kept; reopen FrameCast on the same phone to reconnect automatically.');
                  });
                  return;
                }
                if (connectionGrace.pending) return;
                finishPlaylistTransition();
                setStatus('failed');
                setError('The direct connection was interrupted. Ask the guest to reconnect.');
              } else if (peer.connectionState === 'connecting') setStatus('connecting');
            };
            await peer.setRemoteDescription(new RTCSessionDescription(signal.payload as unknown as RTCSessionDescriptionInit));
            if (peerRef.current !== peer) return;
            for (const candidate of queuedCandidates.current.splice(0)) {
              if (matchesSession(candidate.sessionId, sessionId ?? null)) await peer.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => undefined);
            }
            if (peerRef.current !== peer) return;
            const answer = await peer.createAnswer();
            if (peerRef.current !== peer) return;
            await peer.setLocalDescription(answer);
            if (peerRef.current !== peer) return;
            send('tv', 'answer', { type: answer.type, sdp: answer.sdp, sessionId });
            setStatus('connecting');
          } catch (negotiationError) {
            if (offerPeer && peerRef.current !== offerPeer) return;
            console.error('FrameCast TV could not negotiate the direct connection:', negotiationError);
            finishPlaylistTransition();
            stopPeer();
            queuedCandidates.current = [];
            setStatus('failed');
            setError('Waiting for the phone to reconnect. This pairing room is kept; no new code is needed.');
          }
        })();
      } else if (signal.type === 'ice') {
        const candidate = signal.payload as ScopedIceCandidate;
        if (peerRef.current?.remoteDescription && matchesSession(candidate.sessionId, activeSessionRef.current)) {
          void peerRef.current.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => undefined);
        } else {
          queuedCandidates.current.push(candidate);
          if (queuedCandidates.current.length > 100) queuedCandidates.current.shift();
        }
      } else if (signal.type === 'close') {
        if (!matchesSession(signal.payload.sessionId, activeSessionRef.current)) continue;
        finishPlaylistTransition();
        const fullscreenDocument = document as Document & {
          webkitFullscreenElement?: Element | null;
          webkitCurrentFullScreenElement?: Element | null;
          webkitIsFullScreen?: boolean;
          webkitExitFullscreen?: () => void | Promise<void>;
          webkitCancelFullScreen?: () => void | Promise<void>;
        };
        const pageIsFullscreen = Boolean(document.fullscreenElement || fullscreenDocument.webkitFullscreenElement
          || fullscreenDocument.webkitCurrentFullScreenElement || fullscreenDocument.webkitIsFullScreen);
        if (videoRef.current && isVideoFullscreen(videoRef.current)) {
          void exitVideoFullscreen(videoRef.current);
        } else if (pageIsFullscreen) {
          const exit = document.exitFullscreen ?? fullscreenDocument.webkitExitFullscreen ?? fullscreenDocument.webkitCancelFullScreen;
          if (exit) void Promise.resolve(exit.call(document)).catch(() => undefined);
        }
        autoCinemaFullscreenRoomRef.current = null;
        setNeedsStandbyFullscreen(false);
        stopPeer();
        setScreenMirroring(false);
        setError('');
        setStatus('idle');
      }
    }
  }, [messages, roomId, send, stopPeer, beginPlaylistTransition, finishPlaylistTransition]);

  const startRoom = () => {
    sessionStorage.removeItem('framecast-tv-resume');
    const fullscreenDocument = document as Document & {
      webkitExitFullscreen?: () => void | Promise<void>;
      webkitCancelFullScreen?: () => void | Promise<void>;
    };
    if (!hasActiveTvMedia && videoRef.current && isVideoFullscreen(videoRef.current)) {
      const exit = document.exitFullscreen ?? fullscreenDocument.webkitExitFullscreen ?? fullscreenDocument.webkitCancelFullScreen;
      if (exit) void Promise.resolve(exit.call(document)).catch(() => undefined);
    }
    setNeedsStandbyFullscreen(false);
    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete('resume');
    cleanUrl.searchParams.delete('after');
    window.history.replaceState(null, '', cleanUrl.href);
    if (room) send('tv', 'close', { reason: 'new-room' });
    stopPeer();
    queuedCandidates.current = [];
    setError('');
    setStatus('idle');
    createRoomMutation();
  };
  const reconnect = () => {
    startRoom();
  };
  const phoneUrl = room ? `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, '')}/send/${encodeURIComponent(room.id)}` : '';
  const roomExpired = Boolean(room && new Date(room.expiresAt).getTime() <= clock);
  const statusCopy = status === 'connected'
    ? screenMirroring
      ? 'Phone screen mirrored live. Stop sharing from your phone when finished.'
      : transferProgress !== null && transferProgress < 100
      ? photoPreviewVisible && mediaKind === 'image'
        ? 'Quick photo preview is on screen. The full photo is arriving directly.'
        : `Connected. Receiving the guest’s ${mediaKind === 'image' ? 'photo' : 'video'}…`
      : transferProgress === null
        ? 'Connected directly. Waiting for media from the phone.'
        : `The guest’s ${mediaKind === 'image' ? 'photo' : 'video'} is on this screen.`
    : status === 'paired'
      ? 'Paired with a phone. Waiting for a direct connection.'
    : status === 'connecting'
      ? 'A guest is here. Making a direct connection…'
      : status === 'disconnected'
        ? 'Phone away. Pairing kept — it will reconnect when the phone returns.'
        : status === 'failed'
          ? 'Waiting for the phone to reconnect. Keep this room open; no new code is needed.'
          : room ? 'Ready when you are. Scan the code with your phone camera.' : 'Create a private room to pair your phone with this screen.';

  const showCinemaStandby = Boolean(room && !roomExpired && status !== 'idle' && !hasActiveTvMedia);
  const cinemaConnectionLabel = status === 'disconnected' || status === 'failed'
    ? 'Phone reconnecting'
    : status === 'connecting'
      ? 'Connecting to phone'
      : 'Phone paired';
  const cinemaReadyMessage = status === 'disconnected' || status === 'failed'
    ? 'Keep this room open; the same phone can reconnect.'
    : 'Ready for your next photo or video';
  const cinemaErrorMessage = error || (messagesQuery.isError
    ? 'The room signal is interrupted. Keep this screen open while the phone reconnects.'
    : undefined);

  useEffect(() => {
    if (!showCinemaStandby || !room) {
      if (!showCinemaStandby) setNeedsStandbyFullscreen(false);
      return;
    }
    if (autoCinemaFullscreenRoomRef.current === room.id) return;
    autoCinemaFullscreenRoomRef.current = room.id;
    if (videoRef.current ? isVideoFullscreen(videoRef.current) : Boolean(document.fullscreenElement)) {
      setNeedsStandbyFullscreen(false);
      return;
    }
    let active = true;
    void requestMediaFullscreen(document.documentElement).then((entered) => {
      if (active) setNeedsStandbyFullscreen(!entered);
    });
    return () => { active = false; };
  }, [room?.id, showCinemaStandby]);

  return (
    <div className={`app-shell${showCinemaStandby ? ' tv-cinema-standby' : playlistTransitioning || (status === 'connected' && !(mediaKind === 'video' && videoReturnedInline) && !(mediaKind === 'image' && photoReturnedInline)) ? ' tv-immersive-playback' : ''}`}>
      {showCinemaStandby && (
        <div className="tv-cinema-overlay">
        <TvCinemaWaitingScreen
          connectionLabel={cinemaConnectionLabel}
          connectionMessage={statusCopy}
          readyMessage={cinemaReadyMessage}
          errorMessage={cinemaErrorMessage}
          isFullscreen={browserFullscreen}
          needsManualFullscreen={needsStandbyFullscreen && !browserFullscreen}
          onToggleFullscreen={toggleBrowserFullscreen}
          onNewRoom={reconnect}
        />
        </div>
      )}
      {/* Keep the receiver mounted while waiting: incoming tracks and URL
          messages need videoRef before they can switch off the standby screen. */}
      <div className="tv-receiver-content" inert={showCinemaStandby || undefined} aria-hidden={showCinemaStandby || undefined}>
      <BrandHeader />
      <main className="page-wrap fade-in">
        <div className="hero-grid">
          <section className="hero-copy">
            <span className="eyebrow">A better way to share the big screen</span>
            <h1 className="hero-title">Your photos &amp; videos.<br /><em>The big screen.</em></h1>
            <p className="hero-intro">Send a photo or video from your phone, or open a video link on this TV browser. No account or media upload needed.</p>
            <div className="trust-line"><ShieldCheck size={17} /> Phone files go directly to this screen. Video links are fetched by the TV from their source.</div>
          </section>

          <section ref={playbackStageRef} className="pair-card" aria-label="TV pairing and playback">
            <div className="card-heading">
              <div><span className="eyebrow">This screen</span><h2>Pair a phone</h2></div>
              <div className="card-heading-actions">
                <span className="screen-chip"><Monitor size={13} /> TV browser</span>
                <button type="button" className="tv-fullscreen-toggle" onClick={toggleBrowserFullscreen} data-testid="button-tv-fullscreen" aria-label={browserFullscreen ? 'Exit browser full screen' : 'Enter browser full screen'}>
                  {browserFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                  <span>{browserFullscreen ? 'Exit full screen' : 'Full screen'}</span>
                </button>
              </div>
            </div>
            <div className={!youtubeVideoId && (status === 'connected' || playlistTransitioning) && mediaKind === 'video' ? 'tv-video-stage' : 'sr-only'}>
            <video
              ref={videoRef}
              className="video-preview"
              style={tvVideoPresentation(videoFitMode)}
              autoPlay
              controls={!canvasPlayback}
              playsInline
              muted={muted}
              aria-label="Video playing from the guest phone"
              data-testid="video-tv-playback"
            />
            {!youtubeVideoId && canvasPlayback && <RotatedVideoCanvas
              videoRef={videoRef} rotation={videoRotation} fitMode={videoFitMode}
              encodedWidth={orientationSourceRef.current?.encodedWidth}
              encodedHeight={orientationSourceRef.current?.encodedHeight}
              sourceKey={videoRef.current?.src || ''}
              onFailure={handleCanvasFailure}
            />}
            </div>
            {!browserFullscreen && status === 'connected' && mediaKind === 'video' && (
              <button type="button" className="button-secondary tv-video-fullscreen-permission" onClick={toggleBrowserFullscreen} data-testid="button-tv-video-fullscreen-permission">
                <Maximize2 size={20} /> Full screen — click here or press OK with the TV remote
              </button>
            )}
            {needsPhotoFullscreen && status === 'connected' && mediaKind === 'image' && (
              <button type="button" className="button-secondary tv-video-fullscreen-permission" onClick={toggleBrowserFullscreen} data-testid="button-tv-photo-fullscreen-permission">
                <Maximize2 size={16} /> Press here with the TV remote for photo full screen
              </button>
            )}
            {youtubeVideoId && status === 'connected' && (
              <YouTubePlayer
                videoId={youtubeVideoId}
                className="youtube-player-tv"
                onReady={handleYouTubeReady}
                onStateChange={handleYouTubeStateChange}
                onError={handleYouTubeError}
                onAutoplayBlocked={handleYouTubeAutoplayBlocked}
              />
            )}
            {status === 'connected' && mediaKind === 'image' && receivedImages[currentImageIndex] && (
              <>
                <img
                  className="image-preview"
                  src={receivedImages[currentImageIndex].url}
                  onLoad={() => {
                    if (photoFullscreenAttemptedRef.current || !playbackStageRef.current) return;
                    photoFullscreenAttemptedRef.current = true;
                    setPhotoReturnedInline(false);
                    void requestMediaFullscreen(playbackStageRef.current).then((entered) => setNeedsPhotoFullscreen(!entered));
                  }}
                  alt={receivedImages[currentImageIndex].name}
                  style={{ transform: `translateY(${imageOffsetY}px) scale(${imageZoom})` }}
                  data-testid="image-tv-current"
                />
                {receivedImages.length > 1 && (
                  <div className="tv-photo-position" aria-live="polite" data-testid="text-tv-photo-position">
                    Photo {currentImageIndex + 1} of {receivedImages.length}
                  </div>
                )}
              </>
            )}
            {status === 'connected' && !playlistTransitioning && !videoStreamActive && transferProgress !== null && transferProgress < 100 && (mediaKind !== 'image' || receivedImages.length === 0) && (
              <div className="tv-transfer-status" role="status" data-testid="status-tv-transfer">
                <span className="tv-transfer-spinner" />
                <strong>Receiving {mediaKind === 'image' ? 'photo' : 'video'}</strong>
                <span>{videoStreamActive ? `Playing while transfer continues · ${transferProgress}%` : `${transferProgress}% · keep your devices awake`}</span>
              </div>
            )}
            {playlistTransitioning && (
              <div className="tv-transfer-status" role="status" aria-live="polite" data-testid="status-tv-next-video">
                <span className="tv-transfer-spinner" />
                <strong>Loading next video</strong>
                <span>Stay on this screen while playback switches.</span>
              </div>
            )}
            {status !== 'connected' && !playlistTransitioning && (
              <div className="qr-frame" data-testid="status-pairing-code" aria-label={room ? 'Scan the QR code to pair your phone' : 'Pairing code not created'}>
                {room && !roomExpired
                  ? <QRCodeSVG value={phoneUrl} size={184} level="M" marginSize={1} />
                  : <div className="qr-empty"><Smartphone size={28} /><span>{roomExpired ? 'This pairing code has expired' : 'Your pairing code will appear here'}</span></div>}
              </div>
            )}
              <p className="pair-prompt">{status === 'connected' ? photoPreviewVisible && mediaKind === 'image' ? 'A quick preview is on screen. The complete photo is arriving directly from the phone.' : transferProgress !== null && transferProgress < 100 ? mediaKind === 'video' ? videoStreamActive ? 'The TV is playing this video while it continues to arrive.' : 'The TV is checking the video format and starting playback.' : 'Receiving the photo directly from the phone.' : mediaKind === 'image' && receivedImages.length > 1 ? `${receivedImages.length} photos are ready. Use the phone to browse and zoom.` : `Your guest’s ${mediaKind === 'image' ? 'photo' : 'video'} is on the big screen.` : status === 'paired' ? 'Your guest is connected and choosing content on their phone.' : roomExpired ? 'This temporary room has closed. Create a fresh code to pair again.' : room ? 'Scan with your phone camera or enter the code on the join screen.' : 'Preparing a temporary room for this screen…'}</p>
            {!room || status === 'failed' || roomExpired ? (
              <button type="button" className="button-primary" onClick={startRoom} disabled={creatingRoom} data-testid="button-create-room">
                {creatingRoom ? <RefreshCw size={16} className="animate-spin" /> : status === 'failed' || roomExpired ? <RefreshCw size={16} /> : <ArrowUpRight size={16} />}
                {creatingRoom ? 'Preparing your screen…' : status === 'failed' || roomExpired ? 'Create a fresh room' : 'Create pairing code'}
              </button>
            ) : status === 'connected' ? (
              <div className={`tv-controls${tvControlsVisible ? '' : ' tv-controls-hidden'}`} aria-hidden={!tvControlsVisible}>
                {tvControlsCountdown !== null && <span className="tv-controls-countdown" aria-live="off">Hides in {tvControlsCountdown}</span>}
                <button className="button-secondary" type="button" onClick={toggleBrowserFullscreen} data-testid="button-tv-fullscreen-playback" aria-label={browserFullscreen ? 'Exit browser full screen' : 'Enter browser full screen'}>
                  {browserFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                  {browserFullscreen ? 'Exit full screen' : 'Full screen'}
                </button>
                {mediaKind === 'image' && receivedImages.length > 1 && <>
                  <button className="button-secondary" type="button" onClick={() => {
                    setCurrentImageIndex((index) => Math.max(0, index - 1));
                    setImageZoom(1);
                    setImageOffsetY(0);
                  }} aria-label="Previous photo" data-testid="button-tv-photo-previous">Previous</button>
                  <span className="tv-photo-counter">{currentImageIndex + 1} / {receivedImages.length}</span>
                  <button className="button-secondary" type="button" onClick={() => {
                    setCurrentImageIndex((index) => Math.min(receivedImages.length - 1, index + 1));
                    setImageZoom(1);
                    setImageOffsetY(0);
                  }} aria-label="Next photo" data-testid="button-tv-photo-next">Next</button>
                  <button className="button-secondary" type="button" onClick={() => setImageZoom((zoom) => Math.max(1, Number((zoom - 0.25).toFixed(2))))} aria-label="Zoom out" data-testid="button-tv-photo-zoom-out">−</button>
                  <button className="button-secondary" type="button" onClick={() => { setImageZoom(1); setImageOffsetY(0); }} aria-label="Reset zoom" data-testid="button-tv-photo-zoom-reset">Fit</button>
                  <button className="button-secondary" type="button" onClick={() => setImageZoom((zoom) => Math.min(4, Number((zoom + 0.25).toFixed(2))))} aria-label="Zoom in" data-testid="button-tv-photo-zoom-in">+</button>
                </>}
                {mediaKind === 'video' && <>
                {!youtubeVideoId && <>
                  <button className="button-secondary" type="button" onClick={() => changeVideoFit('cover')} aria-pressed={videoFitMode === 'cover'} data-testid="button-tv-video-fill">Fill TV screen</button>
                  <button className="button-secondary" type="button" onClick={() => changeVideoFit('contain')} aria-pressed={videoFitMode === 'contain'} data-testid="button-tv-video-fit">Fit whole video</button>
                </>}
                {!youtubeVideoId && <button className="button-secondary" type="button" onClick={rotateCurrentVideo} data-testid="button-tv-video-rotate"><RefreshCw size={16} /> Rotate</button>}
                <button className="button-secondary" type="button" onClick={() => {
                  const youtube = youtubePlayerRef.current;
                  if (youtube) {
                    if (youtube.getPlayerState() === 1) youtube.pauseVideo();
                    else youtube.playVideo();
                    return;
                  }
                  const video = videoRef.current;
                  if (!video) return;
                  if (video.paused) {
                    void video.play();
                    if (controlChannelRef.current?.readyState === 'open') {
                      controlChannelRef.current.send('play');
                    }
                    setPlaying(true);
                  } else {
                    video.pause();
                    if (controlChannelRef.current?.readyState === 'open') {
                      controlChannelRef.current.send('pause');
                    }
                    setPlaying(false);
                  }
                }} data-testid="button-tv-play-pause" aria-label={playing ? 'Pause video' : 'Play video'}>
                  {playing ? <Pause size={16} /> : <Play size={16} />}
                  {playing ? 'Pause' : 'Play'}
                </button>
                <button className="button-secondary" type="button" onClick={() => {
                  const nextMuted = !muted;
                  const youtube = youtubePlayerRef.current;
                  if (youtube) {
                    if (nextMuted) youtube.mute();
                    else youtube.unMute();
                  } else if (videoRef.current) {
                    videoRef.current.muted = nextMuted;
                  }
                  setMuted(nextMuted);
                }} data-testid="button-tv-mute" aria-label={muted ? 'Turn sound on' : 'Mute sound'}>
                  {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}{muted ? 'Sound off' : 'Sound on'}
                </button>
                </>}
                <button className="button-quiet" type="button" onClick={reconnect} data-testid="button-tv-new-room">New room</button>
              </div>
            ) : room ? (
              <button className="button-quiet" type="button" onClick={reconnect} data-testid="button-tv-new-room"><RefreshCw size={14} /> New room</button>
            ) : null}
            {room && <div className="room-meta"><span>CODE <strong className="room-code" data-testid="text-room-code">{room.code}</strong></span><span data-testid="text-room-expiry">{roomExpired ? 'Room expired' : '4-hour idle timeout'}</span></div>}
            {room && status !== 'connected' && <div className="room-link" data-testid="text-room-link">{phoneUrl}</div>}
            <div className="status-row" role="status" aria-live="polite" data-testid="status-tv-connection">
              <span className={`status-dot${status === 'connected' ? ' live' : ''}`} />
              <span className="status-text">{statusCopy}</span>
            </div>
            {error && <div className="error-banner" role="alert" data-testid="text-tv-error">{error}</div>}
            {messagesQuery.isError && <div className="error-banner" role="alert" data-testid="text-tv-poll-error">We lost the room signal. Refresh the room to reconnect.</div>}
          </section>
        </div>

        <div className="below-grid">
          <section>
            <span className="eyebrow">Three small steps</span>
            <h3>From your phone to here.</h3>
            <div className="steps">
              <div className="step"><span className="step-number">01</span><strong>Make a room</strong></div>
              <div className="step"><span className="step-number">02</span><strong>Scan with your phone</strong></div>
              <div className="step"><span className="step-number">03</span><strong>Show it on the TV</strong></div>
            </div>
          </section>
          <aside className="privacy-note">
            <LockKeyhole size={18} />
              <div><strong>Private media transfer.</strong><p>Phone files travel directly to the TV. For a video link, the TV requests media from its original site. FrameCast does not store or relay media. The room expires after 4 hours without activity.</p></div>
          </aside>
        </div>
      </main>
      </div>
    </div>
  );
}

function PhonePage({ roomId }: { roomId?: string }) {
  const validRoomId = roomId ?? '';
  const [, setLocation] = useLocation();
  const send = useSignalSender(validRoomId);
  const messagesQuery = useGetCastRoomMessages(validRoomId, {
    query: {
      queryKey: getGetCastRoomMessagesQueryKey(validRoomId),
      refetchInterval: 700,
      enabled: Boolean(validRoomId),
    },
  });
  const [file, setFile] = useState<File | null>(null);
  const [fileQueue, setFileQueue] = useState<File[]>([]);
  const [preparingSelection, setPreparingSelection] = useState(false);
  const selectionRunRef = useRef(0);
  const autoConnectAfterSelectionRef = useRef(false);
  const [videoLink, setVideoLink] = useState('');
  const [videoLinkError, setVideoLinkError] = useState('');
  const [checkingVideoLink, setCheckingVideoLink] = useState(false);
  const [isUrlPlayback, setIsUrlPlayback] = useState(false);
  const [queueIndex, setQueueIndex] = useState(0);
  const [sentQueueCount, setSentQueueCount] = useState(0);
  const [playlistLoading, setPlaylistLoading] = useState(false);
  const videoQueueIndexRef = useRef(0);
  const playlistBusyRef = useRef(false);
  const playlistSwitchRunRef = useRef(0);
  const lastEndedFileRef = useRef<File | null>(null);
  const playlistEndedRef = useRef<() => void>(() => {});
  const [mediaKind, setMediaKind] = useState<MediaKind | null>(null);
  const [objectUrl, setObjectUrl] = useState('');
  const [status, setStatus] = useState<PeerStatus>('idle');
  const [error, setError] = useState('');
  const [transferNotice, setTransferNotice] = useState('');
  const [progress, setProgress] = useState(0);
  const [sentToTv, setSentToTv] = useState(false);
  const [videoStreaming, setVideoStreaming] = useState(false);
  const [remoteVideoState, setRemoteVideoState] = useState({ currentTime: 0, duration: 0, paused: true, volume: 0 });
  const [tvFullscreen, setTvFullscreen] = useState(false);
  const [fullscreenPending, setFullscreenPending] = useState(false);
  const [fullscreenNotice, setFullscreenNotice] = useState('');
  const fullscreenRequestRef = useRef<boolean | null>(null);
  const fullscreenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [streamHealth, setStreamHealth] = useState<StreamHealth | null>(null);
  const qualityMonitorRef = useRef<ReturnType<typeof monitorVideoStream> | null>(null);
  const [tvVideoFit, setTvVideoFit] = useState<'cover' | 'contain'>('contain');
  const [connectionGrace] = useState(createConnectionGrace);
  const [videoSeekDraft, setVideoSeekDraft] = useState<number | null>(null);
  const muted = true;
  const videoRef = useRef<HTMLVideoElement>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const mediaChannelRef = useRef<RTCDataChannel | null>(null);
  const controlChannelRef = useRef<RTCDataChannel | null>(null);
  const transferRunRef = useRef(0);
  const urlCastActiveRef = useRef(false);
  const transferCompleteRef = useRef(false);
  const mediaAckResolverRef = useRef<((playback: string) => void) | null>(null);
  const videoStreamingRef = useRef(false);
  const videoStartupRef = useRef<VideoStartup>({ status: 'waiting' });
  const videoWarningRef = useRef('');
  const phoneVideoStreamRef = useRef<PhoneVideoStream | null>(null);
  const phoneAudioGraphRef = useRef<PhoneAudioGraph | null>(null);
  const screenMirrorAudioRef = useRef<ScreenMirrorAudioPlayer | null>(null);
  const fileQueueRef = useRef<File[]>([]);
  const seenRef = useRef(new Set<number>());
  const queuedCandidates = useRef<ScopedIceCandidate[]>([]);
  const activeSessionRef = useRef<string | null>(null);
  const pairingActiveRef = useRef(true);
  const recoveryWantedRef = useRef(false);
  const lastCastUrlRef = useRef<string | null>(null);
  const hiddenPlaybackRef = useRef<PhoneVideoState | null>(null);
  const connectionAttemptRef = useRef<number | null>(null);
  const connectionStartedRef = useRef(0);
  const [peerProbe] = useState(createPeerProbe);
  const recoveryRef = useRef<ReturnType<typeof createSessionRecovery> | null>(null);
  const reconnectRef = useRef<() => Promise<void>>(async () => {});
  const refetchRoomRef = useRef(messagesQuery.refetch);
  refetchRoomRef.current = messagesQuery.refetch;
  const messages = messagesQuery.data?.messages ?? [];
  const fileSupported = typeof window !== 'undefined' && typeof URL.createObjectURL === 'function';

  const stopPeer = useCallback((sendClose = false) => {
    qualityMonitorRef.current?.stop();
    qualityMonitorRef.current = null;
    setStreamHealth(null);
    if (fullscreenTimerRef.current !== null) clearTimeout(fullscreenTimerRef.current);
    fullscreenTimerRef.current = null;
    fullscreenRequestRef.current = null;
    setTvFullscreen(false);
    setFullscreenPending(false);
    setFullscreenNotice('');
    playlistSwitchRunRef.current++;
    playlistBusyRef.current = false;
    setPlaylistLoading(false);
    connectionGrace.cancel();
    peerProbe.cancel();
    const sessionId = activeSessionRef.current;
    activeSessionRef.current = null;
    phoneVideoStreamRef.current?.stop();
    phoneVideoStreamRef.current = null;
    screenMirrorAudioRef.current?.close();
    screenMirrorAudioRef.current = null;
    selectionRunRef.current += 1;
    setPreparingSelection(false);
    transferRunRef.current += 1;
    transferCompleteRef.current = true;
    urlCastActiveRef.current = false;
    videoStreamingRef.current = false;
    videoStartupRef.current = { status: 'waiting' };
    videoWarningRef.current = '';
    setVideoStreaming(false);
    setRemoteVideoState({ currentTime: 0, duration: 0, paused: true, volume: 0 });
    setVideoSeekDraft(null);
    mediaAckResolverRef.current?.('interrupted');
    mediaAckResolverRef.current = null;
    if (sendClose) send('phone', 'close', { sessionId: sessionId ?? undefined });
    mediaChannelRef.current?.close();
    controlChannelRef.current?.close();
    mediaChannelRef.current = null;
    controlChannelRef.current = null;
    peerRef.current?.getSenders().forEach((sender) => sender.track?.stop());
    peerRef.current?.close();
    peerRef.current = null;
  }, [send]);

  useEffect(() => () => stopPeer(), [stopPeer]);
  useEffect(() => () => {
    const graph = phoneAudioGraphRef.current;
    graph?.source.disconnect();
    if (graph) void graph.context.close().catch(() => console.warn('Phone audio cleanup failed.'));
    phoneAudioGraphRef.current = null;
  }, []);
  useEffect(() => {
    const graph = phoneAudioGraphRef.current;
    if (graph && graph.video !== videoRef.current) {
      graph.source.disconnect();
      graph.video.removeAttribute('src');
      graph.video.load();
      void graph.context.close().catch(() => console.warn('Phone audio cleanup failed.'));
      phoneAudioGraphRef.current = null;
    }
  }, [objectUrl, mediaKind]);
  useEffect(() => () => {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }, [objectUrl]);

  useEffect(() => {
    if (!validRoomId) return;
    setStatus('paired');
    seenRef.current.clear();
    queuedCandidates.current = [];
    send('phone', 'ready', {});
  }, [validRoomId, send]);

  useEffect(() => {
    for (const signal of messages) {
      if (signal.from !== 'tv' || seenRef.current.has(signal.sequence)) continue;
      seenRef.current.add(signal.sequence);
      if (signal.type === 'answer') {
        if (!matchesSession(signal.payload.sessionId, activeSessionRef.current)) continue;
        const peer = peerRef.current;
        if (!peer || peer.signalingState !== 'have-local-offer') continue;
        void (async () => {
          try {
            await peer.setRemoteDescription(new RTCSessionDescription(signal.payload as unknown as RTCSessionDescriptionInit));
            if (peerRef.current !== peer) return;
            for (const candidate of queuedCandidates.current.splice(0)) {
              if (matchesSession(candidate.sessionId, activeSessionRef.current)) await peer.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => undefined);
            }
          } catch {
            if (peerRef.current !== peer) return;
            setStatus('failed');
            setError('The TV could not complete the connection. Try connecting again.');
          }
        })();
      } else if (signal.type === 'ice') {
        if (!matchesSession(signal.payload.sessionId, activeSessionRef.current)) continue;
        const candidate = signal.payload as RTCIceCandidateInit;
        if (peerRef.current?.remoteDescription) {
          void peerRef.current.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => undefined);
        } else {
          queuedCandidates.current.push(candidate);
        }
      } else if (signal.type === 'close') {
        if (!matchesSession(signal.payload.sessionId, activeSessionRef.current)) continue;
        pairingActiveRef.current = false;
        recoveryWantedRef.current = false;
        recoveryRef.current?.cancel();
        stopPeer();
        setIsUrlPlayback(false);
        if (signal.payload.reason === 'new-room') {
          setLocation('/connect');
          return;
        }
        setStatus('disconnected');
        setFile(null);
        setFileQueue([]);
        fileQueueRef.current = [];
        setQueueIndex(0);
        setSentQueueCount(0);
        setMediaKind(null);
        setProgress(0);
        setSentToTv(false);
        setError(signal.payload.reason === 'new-room'
          ? 'The TV started a new room. Scan its new code to reconnect.'
          : 'The TV ended the direct connection.');
      }
    }
  }, [messages, setLocation, stopPeer]);

  const discardUnreadableSelection = () => {
    recoveryWantedRef.current = false;
    recoveryRef.current?.cancel();
    stopPeer(Boolean(peerRef.current));
    fileQueueRef.current = [];
    setFileQueue([]);
    setFile(null);
    setObjectUrl('');
    setMediaKind(null);
    setProgress(0);
    setSentToTv(false);
    setSentQueueCount(0);
    setQueueIndex(0);
    setTransferNotice('');
    setStatus('paired');
    setError(new SelectedMediaAccessError().message);
    // Reset only after discarding invalid handles, so the same file can be reselected.
    const picker = document.getElementById('video-file-input') as HTMLInputElement | null;
    if (picker) picker.value = '';
  };

  const refreshPlaylistNotice = (index: number, length: number) => {
    const live = phoneVideoStreamRef.current;
    if (live && !live.state().ended) {
      setTransferNotice(`Video ${index + 1} of ${length} in your playlist. The next video starts automatically.`);
    }
  };

  const chooseFiles = async (selected?: FileList | File[], append = false) => {
    if (!selected?.length) return;
    const chosen = Array.from(selected);
    if (chosen.length + (append ? fileQueueRef.current.length : 0) > MAX_PLAYLIST_ITEMS) {
      setError('Choose up to 30 videos for a playlist, or up to 30 photos for a gallery.');
      return;
    }
    const selectedKinds = chosen.map((item) => item.type.startsWith('video/')
      ? 'video'
      : item.type.startsWith('image/') ? 'image' : null);
    if (selectedKinds.some((kind) => kind === null)
      || selectedKinds.some((kind) => kind !== selectedKinds[0])
      || (append && (selectedKinds[0] !== 'video' || mediaKind !== 'video'))) {
      setError('Choose videos for a playlist, or photos for a gallery. Do not mix photos and videos in the same selection.');
      return;
    }
    const selectedKind = selectedKinds[0] as MediaKind;
    if (selectedKind === 'image' && chosen.reduce((total, item) => total + item.size, 0) > MAX_MEDIA_QUEUE_SIZE_BYTES) {
      setError('The selected photos must total 256 MB or less. Choose fewer photos.');
      return;
    }
    if (chosen.some(item => !item.size || (selectedKind === 'video' && item.size > MAX_VIDEO_SIZE_BYTES))) {
      setError('Each video must be non-empty and 8 GB or smaller. Choose the original files on this phone.');
      return;
    }
    if (!append) {
      recoveryWantedRef.current = false;
      recoveryRef.current?.cancel();
      hiddenPlaybackRef.current = null;
      stopPeer(Boolean(peerRef.current));
    }
    const selectionRun = selectionRunRef.current;
    setPreparingSelection(true);
    if (!append) {
      setStatus('paired');
      setSentToTv(false);
      setTransferNotice('');
    }
    setError('');
    try {
      const preserved = await preserveBrowserSelection(chosen, () => selectionRun !== selectionRunRef.current, { liveVideo: selectedKind === 'video' });
      if (!preserved || selectionRun !== selectionRunRef.current) return;
      if (append) {
        if (fileQueueRef.current.length + preserved.length > MAX_PLAYLIST_ITEMS) {
          setError('A playlist can contain up to 30 videos.');
          return;
        }
        const next = [...fileQueueRef.current, ...preserved];
        fileQueueRef.current = next;
        setFileQueue(next);
        refreshPlaylistNotice(videoQueueIndexRef.current, next.length);
        return;
      }
      setIsUrlPlayback(false);
      urlCastActiveRef.current = false;
      setVideoLinkError('');
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      const nextUrl = URL.createObjectURL(preserved[0]);
      fileQueueRef.current = preserved;
      autoConnectAfterSelectionRef.current = true;
      setFileQueue(preserved);
      setQueueIndex(0);
      videoQueueIndexRef.current = 0;
      lastEndedFileRef.current = null;
      setSentQueueCount(0);
      setFile(preserved[0]);
      setMediaKind(selectedKind);
      setObjectUrl(nextUrl);
      setStatus('paired');
      setProgress(0);
      setSentToTv(false);
      videoStreamingRef.current = false;
      setVideoStreaming(false);
      setError('');
    } catch {
      if (selectionRun === selectionRunRef.current) {
        if (append) setError('These videos could not be added. Your existing playlist is kept; download the originals onto this phone and select them again.');
        else discardUnreadableSelection();
      }
    } finally {
      if (selectionRun === selectionRunRef.current) setPreparingSelection(false);
    }
  };

  const publishVideoState = (state: PhoneVideoState) => {
    if (playlistBusyRef.current) return;
    // Keep the TV's live player running between tracks: pausing it at every
    // file boundary can make native TV fullscreen close.
    if (state.ended && playlistNeighbour(fileQueueRef.current.length, videoQueueIndexRef.current, 1) !== null) {
      playlistEndedRef.current();
      return;
    }
    const channel = controlChannelRef.current;
    if (channel?.readyState === 'open') channel.send(JSON.stringify({ framecast: 'live-state', ...state }));
    if (state.ended) playlistEndedRef.current();
  };

  const connect = async (remoteUrl?: string, options: { automatic?: boolean; resume?: PhoneVideoState } = {}) => {
    if (preparingSelection) return;
    const castUrl = remoteUrl ? normalizeVideoLink(remoteUrl) : null;
    const allFiles = fileQueueRef.current.length ? fileQueueRef.current : file ? [file] : [];
    const queuedFiles = castUrl ? [] : mediaKind === 'video' ? allFiles.slice(videoQueueIndexRef.current, videoQueueIndexRef.current + 1) : allFiles;
    if (!castUrl && (!queuedFiles.length || !mediaKind)) {
      setError('Choose photos or a video first, then connect to the TV.');
      return;
    }
    if (castUrl) {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setFile(null);
      setFileQueue([]);
      fileQueueRef.current = [];
      setObjectUrl('');
      setMediaKind('video');
    }
    for (const selected of castUrl ? [] : queuedFiles) {
      if (selected.size <= 0) {
        setError('One of the selected files is empty. Choose it again and retry.');
        return;
      }
      const selectedKind: MediaKind = selected.type.startsWith('video/') ? 'video' : 'image';
      if (selected.size > (selectedKind === 'video' ? MAX_VIDEO_SIZE_BYTES : MAX_MEDIA_SIZE_BYTES)) {
        setError(selectedKind === 'video' ? 'Videos must be 8 GB or smaller to stream directly.' : 'Photos must be under 256 MB each.');
        return;
      }
    }
    setError('');
    pairingActiveRef.current = true;
    recoveryWantedRef.current = true;
    recoveryRef.current?.cancel();
    lastCastUrlRef.current = castUrl;
    if (!options.automatic) hiddenPlaybackRef.current = null;
    setTransferNotice('');
    setStatus('connecting');
    setProgress(0);
    setSentToTv(false);
    setIsUrlPlayback(Boolean(castUrl));
    videoStreamingRef.current = false;
    setVideoStreaming(false);
    setQueueIndex(castUrl || mediaKind !== 'video' ? 0 : videoQueueIndexRef.current);
    setSentQueueCount(0);
    stopPeer();
    urlCastActiveRef.current = Boolean(castUrl);
    queuedCandidates.current = [];
    transferCompleteRef.current = false;
    const transferRun = transferRunRef.current;
    connectionAttemptRef.current = transferRun;
    connectionStartedRef.current = Date.now();
    const sessionId = crypto.randomUUID();
    activeSessionRef.current = sessionId;
    let videoSetupStage = 'preparing the direct connection';
    try {
      if (!castUrl && queuedFiles.length === 1 && queuedFiles[0].type.startsWith('video/')) {
        const video = videoRef.current;
        if (!video) throw new Error('The phone video preview is not ready. Choose the video again.');
        videoSetupStage = 'creating the phone audio connection';
        let graph = phoneAudioGraphRef.current;
        if (!graph || graph.video !== video) {
          if (graph) { graph.source.disconnect(); void graph.context.close(); }
          graph = createPhoneAudioGraph(video);
          phoneAudioGraphRef.current = graph;
        }
        videoSetupStage = 'starting live video capture on the phone';
        const live = startPhoneVideoStream(video, graph, {
          previewMuted: muted,
          onState: (state) => {
            if (transferRun !== transferRunRef.current) return;
            publishVideoState(state);
          },
          onError: (message) => {
            if (transferRun !== transferRunRef.current) return;
            recoveryWantedRef.current = false;
            recoveryRef.current?.cancel();
            setError(message);
            setStatus('failed');
            stopPeer(true);
          },
        });
        phoneVideoStreamRef.current = live;
        setTransferNotice('Opening the first video frame on this phone… No whole-video preparation or upload.');
        videoSetupStage = 'opening the selected video on the phone';
        await live.ready;
        if (transferRun !== transferRunRef.current) return;
        if (options.resume) {
          videoSetupStage = 'restoring the video position and orientation';
          await live.command(`video:seek:${options.resume.currentTime}`);
          await live.command(`video:fit:${options.resume.fitMode}`);
          for (let rotation = 0; rotation < options.resume.rotation; rotation += 90) await live.command('video:rotate');
        }
        setTransferNotice('Phone video is ready. Connecting directly to the TV…');
      }
      // A successful phone decoder already proves video access. Head/tail
      // probes can force a cloud provider to download the whole film.
      if (!phoneVideoStreamRef.current) {
        for (const selected of queuedFiles) {
          await assertBrowserFileReadable(selected);
          if (transferRun !== transferRunRef.current) return;
        }
      }
      videoSetupStage = 'creating the direct TV connection';
      const peer = new RTCPeerConnection(rtcConfig);
      peerRef.current = peer;
      const live = phoneVideoStreamRef.current;
      if (live) {
        videoSetupStage = 'reading the phone video and audio tracks';
        const tracks = live.stream.getTracks();
        for (const track of tracks) {
          videoSetupStage = `adding the phone ${track.kind} track to WebRTC`;
          peer.addTrack(track, live.stream);
        }
      }
      if (live) {
        videoSetupStage = 'selecting a compatible video codec';
        try { preferHardwareVideoCodec(peer); }
        catch (error) { console.warn('Codec preference unavailable; using browser codec negotiation.', error); }
      }
      const applyVideoQuality = () => {
        if (!live || peerRef.current !== peer) return;
        videoSetupStage = 'configuring the phone video encoder';
        for (const sender of peer.getSenders()) {
          if (sender.track?.kind === 'video') {
            void configureVideoSender(sender, live.profile()).catch((error) => {
              // Optional encoder tuning must not prevent otherwise working TV
              // playback on older Safari/Samsung implementations.
              console.warn('HD encoder tuning unavailable; browser automatic video quality remains active.', error);
            });
          }
        }
      };
      applyVideoQuality();
      if (live) {
        videoSetupStage = 'starting video performance monitoring';
        qualityMonitorRef.current = monitorVideoStream(peer, live, {
          onSample: sample => { if (peerRef.current === peer) setStreamHealth(sample); },
          onProfileChanged: applyVideoQuality,
        });
      }
      let connectedOnce = false;
      const holdInterruptedConnection = () => {
        connectionGrace.hold(() => {
          if (transferRun !== transferRunRef.current || peerRef.current !== peer) return;
          setStatus('disconnected');
          setError('Pairing and selection are kept. Return to this page to reconnect to the same TV automatically.');
          recoveryRef.current?.wake();
        });
      };
      const controlChannel = peer.createDataChannel('framecast-control');
      controlChannelRef.current = controlChannel;
      controlChannel.onopen = () => {
        const live = phoneVideoStreamRef.current;
        if (live) controlChannel.send(JSON.stringify({ framecast: 'live-state', ...live.state() }));
      };
      controlChannel.onmessage = (event) => {
        if (transferRun !== transferRunRef.current) return;
        if (typeof event.data !== 'string') return;
        try {
          const packet = JSON.parse(event.data) as { framecast?: string; currentTime?: number; duration?: number; paused?: boolean; volume?: number; fitMode?: 'cover' | 'contain'; fullscreen?: boolean; needsGesture?: boolean };
          if (packet.framecast === 'video-health') {
            qualityMonitorRef.current?.receive(packet);
            return;
          }
          if ((packet.framecast === 'video-state' || packet.framecast === 'fullscreen-state') && typeof packet.fullscreen === 'boolean') {
            setTvFullscreen(packet.fullscreen);
            if (packet.framecast === 'fullscreen-state' || fullscreenRequestRef.current === packet.fullscreen) {
              if (fullscreenTimerRef.current !== null) clearTimeout(fullscreenTimerRef.current);
              fullscreenTimerRef.current = null;
              fullscreenRequestRef.current = null;
              setFullscreenPending(false);
              setFullscreenNotice('');
            }
            if (packet.fullscreen) setFullscreenNotice('');
            if (packet.needsGesture) setFullscreenNotice('The TV browser requires its own remote button. Press Full screen or OK on the TV; your video is still connected.');
          }
          if (packet.framecast === 'session-alive') {
            peerProbe.accept((JSON.parse(event.data) as { nonce?: unknown }).nonce);
            connectionGrace.cancel();
            setError('');
            setStatus('connected');
            return;
          }
          if (packet.framecast === 'live-command') {
            const action = (JSON.parse(event.data) as { action?: unknown }).action;
            if (typeof action === 'string') void phoneVideoStreamRef.current?.command(action).catch(() => setError('Tap Play on the phone to resume this video.'));
            return;
          }
          if (packet.framecast === 'video-state') {
            if (packet.fitMode === 'cover' || packet.fitMode === 'contain') setTvVideoFit(packet.fitMode);
            setRemoteVideoState({
              currentTime: Number.isFinite(packet.currentTime) ? Math.max(0, packet.currentTime ?? 0) : 0,
              duration: Number.isFinite(packet.duration) ? Math.max(0, packet.duration ?? 0) : 0,
              paused: Boolean(packet.paused),
              volume: Number.isFinite(packet.volume) ? Math.min(1, Math.max(0, packet.volume ?? 0)) : 0,
            });
          }
        } catch {
          // Photo and playback commands remain plain text on this channel.
        }
      };
      const mediaChannel = peer.createDataChannel('framecast-media');
      mediaChannelRef.current = mediaChannel;
      mediaChannel.binaryType = 'arraybuffer';
      mediaChannel.onmessage = (event) => {
        if (transferRun !== transferRunRef.current) return;
        if (typeof event.data !== 'string') return;
        try {
          const packet = JSON.parse(event.data) as { framecast?: string; playback?: string; message?: string };
          if (packet.framecast === 'streaming') {
            videoStreamingRef.current = true;
            setVideoStreaming(true);
            setTransferNotice(videoWarningRef.current);
            if (phoneVideoStreamRef.current) {
              transferCompleteRef.current = true;
              setProgress(100);
              setSentToTv(true);
              setTransferNotice('Playing directly from your phone. Keep FrameCast open while playing.');
            }
            if (urlCastActiveRef.current) {
              transferCompleteRef.current = true;
              setProgress(100);
              setSentToTv(true);
            }
          }
          if (packet.framecast === 'playback-blocked') {
            videoStartupRef.current = { status: 'blocked', message: packet.message };
            setTransferNotice(packet.message || 'Press Play with the TV remote. Your phone is still connected.');
            return;
          }
          if (packet.framecast === 'playback-warning') {
            videoWarningRef.current = packet.message || 'The TV is using its standard video player.';
            setTransferNotice(videoWarningRef.current);
            return;
          }
          if (packet.framecast === 'stream-error') {
            recoveryWantedRef.current = false;
            recoveryRef.current?.cancel();
            const streamMessage = packet.message || 'This video cannot stream in the TV browser. Choose a stream-ready H.264/AAC fragmented MP4.';
            if (/illegal invocation/i.test(streamMessage)) {
              console.error('FrameCast TV reported an internal video playback error:', streamMessage);
              setError('The TV browser reported “Illegal invocation” while opening the video. The phone connected, but the TV could not start playback.');
            } else {
              setError(streamMessage);
            }
            setTransferNotice('');
            setStatus('failed');
            stopPeer();
            return;
          }
          if (packet.framecast === 'buffered') {
            setTransferNotice(packet.message || 'This video will start after the transfer finishes.');
          }
          if (packet.framecast === 'received') {
            if (packet.playback === 'failed') {
              const messageText = 'The video reached the TV, but its player reported that it could not play it. Try another video or check the TV screen for details.';
              videoStartupRef.current = { status: 'failed', message: messageText };
              setError(messageText);
            }
            if (packet.playback === 'playing') {
              videoStreamingRef.current = true;
              setVideoStreaming(true);
              setTransferNotice(videoWarningRef.current || 'The TV started the video after the full transfer.');
            }
            const resolve = mediaAckResolverRef.current;
            mediaAckResolverRef.current = null;
            resolve?.(packet.playback ?? 'displayed');
          }
        } catch {
          setError('The TV returned an unreadable transfer response. Try sending the file again.');
        }
      };
      mediaChannel.onopen = () => {
        if (transferRun !== transferRunRef.current) return;
        setStatus('connected');
        void (async () => {
          try {
            if (castUrl) {
              videoSetupStage = 'opening the video link on the TV';
              mediaChannel.send(JSON.stringify({ framecast: 'remote-video', url: castUrl }));
              return;
            }
            if (queuedFiles.some((item) => item.type.startsWith('video/'))) {
              videoSetupStage = 'checking the TV video player';
              await verifyRotationRenderer(mediaChannel);
              if (transferRun !== transferRunRef.current) return;
            }
            const live = phoneVideoStreamRef.current;
            if (live) {
              videoSetupStage = 'starting video playback on the TV';
              mediaChannel.send(JSON.stringify({ framecast: 'live-video' }));
              await live.command('play');
              const startup = await waitForVideoStartup({
                state: () => videoStreamingRef.current ? { status: 'playing' } : videoStartupRef.current,
                active: () => transferRun === transferRunRef.current,
              });
              if (startup.status === 'interrupted' || transferRun !== transferRunRef.current) return;
              if (options.resume?.paused || options.resume?.ended) await live.command('pause');
              transferCompleteRef.current = true;
              setProgress(100);
              setSentToTv(startup.status === 'playing');
              setSentQueueCount(1);
              setTransferNotice(startup.status === 'blocked'
                ? startup.message || 'Press Play with the TV remote. Your phone is connected.'
                : 'Playing directly from your phone. Rotation and screen fitting happen on the phone, not in the TV browser. Keep FrameCast open while playing.');
              return;
            }
            if (queuedFiles.some((item) => item.type.startsWith('video/'))) {
              throw new Error('The live video stream stopped before playback. Keep this phone page open and tap Try again. Videos are not prepared or uploaded in full.');
            }
            videoSetupStage = 'sending the selected media to the TV';
            for (let index = 0; index < queuedFiles.length; index += 1) {
              if (transferRun !== transferRunRef.current) return;
              videoStartupRef.current = { status: 'waiting' };
              videoStreamingRef.current = false;
              setVideoStreaming(false);
              const selected = queuedFiles[index];
              const kind: MediaKind = selected.type.startsWith('video/') ? 'video' : 'image';
              setQueueIndex(index);
              setFile(selected);
              setMediaKind(kind);
              const nextUrl = URL.createObjectURL(selected);
              setObjectUrl(nextUrl);
               const itemId = kind === 'image' ? `${Date.now()}-${index}` : undefined;
               if (kind === 'image') {
                 const previewDataUrl = await createPhotoPreviewDataUrl(selected);
                 if (previewDataUrl && transferRun === transferRunRef.current) {
                   await waitForDataChannelBuffer(mediaChannel);
                   mediaChannel.send(JSON.stringify({
                     framecast: 'preview',
                     itemId,
                     name: selected.name,
                     kind: 'image',
                     previewDataUrl,
                   }));
                 }
               }
              const outgoing = kind === 'image' ? await preparePhotoForTransfer(selected) : selected;
              if (transferRun !== transferRunRef.current) return;
              setProgress(0);
              const mimeType = getMediaMimeType(outgoing, kind);
              let lastProgressUpdate = 0;
               {
                 mediaChannel.send(JSON.stringify({
                   framecast: 'metadata',
                   name: outgoing.name,
                   itemId,
                   mimeType,
                   kind,
                   size: outgoing.size,
                   streamCandidate: false,
                 }));
                 for (let offset = 0; offset < outgoing.size; offset += MEDIA_CHUNK_SIZE_BYTES) {
                   if (transferRun !== transferRunRef.current) return;
                   await waitForDataChannelBuffer(mediaChannel);
                   const chunk = await outgoing.slice(offset, Math.min(offset + MEDIA_CHUNK_SIZE_BYTES, outgoing.size)).arrayBuffer();
                   if (transferRun !== transferRunRef.current) return;
                   mediaChannel.send(chunk);
                   const sentBytes = Math.min(offset + chunk.byteLength, outgoing.size);
                   const now = Date.now();
                   if (now - lastProgressUpdate > 120 || sentBytes === outgoing.size) {
                     setProgress(Math.min(99, Math.round((sentBytes / outgoing.size) * 100)));
                     lastProgressUpdate = now;
                   }
                }
              }
              let acknowledgement: Promise<string> | undefined;
              if (kind === 'image') {
                acknowledgement = new Promise<string>((resolve, reject) => {
                  const timeout = window.setTimeout(() => {
                    mediaAckResolverRef.current = null;
                    reject(new Error('The TV did not confirm the photo. Check that its screen is awake and try again.'));
                  }, 60_000);
                  mediaAckResolverRef.current = (playback) => {
                    window.clearTimeout(timeout);
                    resolve(playback);
                  };
                });
              }
               {
                 await waitForDataChannelBuffer(mediaChannel);
                 mediaChannel.send(JSON.stringify({ framecast: 'complete' }));
               }
              if (kind === 'video') {
                const startup = await waitForVideoStartup({
                  state: () => videoStreamingRef.current ? { status: 'playing' } : videoStartupRef.current,
                  active: () => transferRun === transferRunRef.current,
                });
                if (startup.status === 'interrupted' || transferRun !== transferRunRef.current) return;
              } else {
                const playback = await acknowledgement;
                if (transferRun !== transferRunRef.current) return;
                if (playback === 'failed') {
                  throw new Error('The TV could not display this photo. Choose it again and retry.');
                }
              }
              setSentQueueCount(index + 1);
              setProgress(100);
              if (index < queuedFiles.length - 1) {
                await new Promise((resolve) => window.setTimeout(resolve, 1600));
              }
            }
            if (transferRun !== transferRunRef.current) return;
            transferCompleteRef.current = true;
            setSentQueueCount(queuedFiles.length);
            if (queuedFiles.length > 1) {
              setQueueIndex(0);
              setFile(queuedFiles[0]);
              setMediaKind('image');
              setObjectUrl(URL.createObjectURL(queuedFiles[0]));
            }
            setProgress(100);
            setSentToTv(true);
          } catch (transferError) {
            if (transferRun !== transferRunRef.current) return;
            if (isSelectedMediaAccessError(transferError)) {
              discardUnreadableSelection();
              return;
            }
            if (connectedOnce && (peer.connectionState === 'disconnected' || peer.connectionState === 'failed' || mediaChannel.readyState === 'closed')) {
              holdInterruptedConnection();
              return;
            }
            setStatus('failed');
            const message = transferError instanceof Error ? transferError.message : 'The file could not be sent directly. Try again.';
            if (/illegal invocation/i.test(message) && mediaKind === 'video') {
              console.error(`FrameCast video playback failed while ${videoSetupStage}.`, transferError);
              setError(`Chrome reported “Illegal invocation” while ${videoSetupStage}. The pairing is active, but video playback failed.`);
            } else {
              setError(message);
            }
          }
        })();
      };
      mediaChannel.onclose = () => {
        if (transferRun !== transferRunRef.current || transferCompleteRef.current) return;
        if (connectedOnce) {
          holdInterruptedConnection();
          return;
        }
        setStatus((current) => current === 'failed' ? current : 'disconnected');
        setError((current) => current || 'The direct connection ended before the file reached the TV. Keep both devices awake and try again.');
      };
      peer.onicecandidate = (event) => {
        if (transferRun !== transferRunRef.current) return;
        if (event.candidate) send('phone', 'ice', { ...event.candidate.toJSON(), sessionId });
      };
      peer.onconnectionstatechange = () => {
        if (transferRun !== transferRunRef.current) return;
        if (peer.connectionState === 'connected') {
          connectedOnce = true;
          applyVideoQuality();
          if (connectionGrace.interrupted) setError('');
          connectionGrace.cancel();
          setStatus('connected');
        } else if (peer.connectionState === 'disconnected') {
          holdInterruptedConnection();
          recoveryRef.current?.wake();
        } else if (peer.connectionState === 'failed') {
          recoveryRef.current?.wake();
          if (connectedOnce) {
            holdInterruptedConnection();
            return;
          }
          setStatus('failed');
          setError('A direct connection failed. Your router may block devices from talking to each other. Check that neither device is on guest Wi-Fi or a VPN, and that Wi-Fi client isolation is off. FrameCast does not relay media.');
        } else if (peer.connectionState === 'connecting') {
          setStatus('connecting');
        }
      };
      videoSetupStage = 'negotiating the direct connection with the TV';
      const offer = await peer.createOffer();
      if (transferRun !== transferRunRef.current) return;
      await peer.setLocalDescription(offer);
      if (transferRun !== transferRunRef.current) return;
      send('phone', 'offer', { type: offer.type, sdp: offer.sdp, sessionId, mediaKind: castUrl ? 'video' : mediaKind, transport: 'data-channel' });
      videoSetupStage = 'waiting for the TV to open the video';
      recoveryRef.current?.wake();
    } catch (connectionError) {
      if (transferRun !== transferRunRef.current) return;
      if (isSelectedMediaAccessError(connectionError)) {
        discardUnreadableSelection();
        return;
      }
      recoveryWantedRef.current = false;
      stopPeer();
      setStatus('failed');
      const message = connectionError instanceof Error ? connectionError.message : 'Could not start a direct connection to the TV.';
      if (/illegal invocation/i.test(message) && queuedFiles.some((selected) => selected.type.startsWith('video/'))) {
        console.error(`FrameCast video startup failed while ${videoSetupStage}.`, connectionError);
        setError(`Chrome reported “Illegal invocation” while ${videoSetupStage}. This is specific to video startup, not the photo or Wi-Fi connection.`);
      } else {
        setError(message);
      }
    } finally {
      if (connectionAttemptRef.current === transferRun) connectionAttemptRef.current = null;
    }
  };

  reconnectRef.current = async () => {
    const liveState = phoneVideoStreamRef.current?.state();
    const resume = liveState ? { ...liveState, paused: hiddenPlaybackRef.current?.paused ?? liveState.paused } : hiddenPlaybackRef.current ?? undefined;
    setTransferNotice('Reconnecting to the same TV… Your pairing is kept.');
    await connect(lastCastUrlRef.current ?? undefined, { automatic: true, resume });
  };

  useEffect(() => {
    if (!autoConnectAfterSelectionRef.current || preparingSelection || status !== 'paired' || !validRoomId || !fileQueue.length) return;
    autoConnectAfterSelectionRef.current = false;
    void connect();
  }, [connect, fileQueue.length, preparingSelection, status, validRoomId]);

  useEffect(() => {
    const recovery = createSessionRecovery({
      active: () => pairingActiveRef.current && recoveryWantedRef.current,
      visible: () => document.visibilityState !== 'hidden' && navigator.onLine,
      healthy: async () => {
        if (connectionAttemptRef.current !== null) return true;
        const peer = peerRef.current;
        if (peerIsOpening(peer?.connectionState, mediaChannelRef.current?.readyState, controlChannelRef.current?.readyState, Date.now() - connectionStartedRef.current)) return true;
        if (peer?.connectionState !== 'connected' || mediaChannelRef.current?.readyState !== 'open') return false;
        return peerProbe.check(controlChannelRef.current);
      },
      recover: () => reconnectRef.current(),
      onError: () => {
        setStatus('disconnected');
        setTransferNotice('Pairing is kept. Automatic reconnect will try again; you can also tap Try again.');
      },
    });
    recoveryRef.current = recovery;
    const onReturn = () => {
      if (document.visibilityState === 'hidden') {
        hiddenPlaybackRef.current = phoneVideoStreamRef.current?.state() ?? hiddenPlaybackRef.current;
        recovery.cancel();
        return;
      }
      if (!pairingActiveRef.current) return;
      void refetchRoomRef.current();
      if (!recoveryWantedRef.current) {
        send('phone', 'ready', {});
        return;
      }
      const live = phoneVideoStreamRef.current;
      if (live && hiddenPlaybackRef.current && !hiddenPlaybackRef.current.paused) {
        const graph = phoneAudioGraphRef.current;
        void graph?.context.resume().catch(() => setTransferNotice('Pairing is kept. Tap Play on the phone to resume sound.'));
        void live.command('play').catch(() => setTransferNotice('Pairing is kept. Tap Play on the phone to resume video.'));
      }
      recovery.wake();
    };
    document.addEventListener('visibilitychange', onReturn);
    window.addEventListener('pageshow', onReturn);
    window.addEventListener('focus', onReturn);
    window.addEventListener('online', onReturn);
    recovery.wake();
    return () => {
      recovery.dispose();
      peerProbe.cancel();
      if (recoveryRef.current === recovery) recoveryRef.current = null;
      document.removeEventListener('visibilitychange', onReturn);
      window.removeEventListener('pageshow', onReturn);
      window.removeEventListener('focus', onReturn);
      window.removeEventListener('online', onReturn);
    };
  }, [validRoomId, send, peerProbe]);

  const castVideoLink = async () => {
    setVideoLinkError('');
    setCheckingVideoLink(true);
    try {
      const resolvedUrl = await resolveVideoLink(videoLink);
      await connect(resolvedUrl);
    } catch (linkError) {
      setVideoLinkError(linkError instanceof TypeError
        ? 'This browser could not inspect that webpage. Try a direct video link, or use the native FrameCast app.'
        : linkError instanceof Error && linkError.name === 'AbortError'
          ? 'The webpage took too long to check. Try a direct video link.'
          : linkError instanceof Error ? linkError.message : 'Could not find a playable video at that link.');
    } finally {
      setCheckingVideoLink(false);
    }
  };

  const castVideoLinkDirectly = async () => {
    setVideoLinkError('');
    setCheckingVideoLink(true);
    try {
      await connect(normalizeVideoLink(videoLink));
    } catch (linkError) {
      setVideoLinkError(linkError instanceof Error ? linkError.message : 'Paste a complete video link.');
    } finally {
      setCheckingVideoLink(false);
    }
  };

  const showPlaylistPreview = (index: number) => {
    const selected = fileQueueRef.current[index];
    if (!selected) return null;
    const url = URL.createObjectURL(selected);
    videoQueueIndexRef.current = index;
    // Commit src before play(): a later React src update would otherwise abort
    // the new video's pending play promise, particularly in mobile Safari.
    flushSync(() => {
      setQueueIndex(index);
      setFile(selected);
      setObjectUrl(url);
      setProgress(0);
      setError('');
    });
    return url;
  };

  const playPlaylistItem = async (index: number) => {
    if (playlistBusyRef.current || preparingSelection) return;
    if (index < 0 || index >= fileQueueRef.current.length) return;
    playlistBusyRef.current = true;
    setPlaylistLoading(true);
    lastEndedFileRef.current = null;
    hiddenPlaybackRef.current = null;
    const run = ++playlistSwitchRunRef.current;
    const live = phoneVideoStreamRef.current;
    const url = showPlaylistPreview(index);
    if (!url) { playlistBusyRef.current = false; setPlaylistLoading(false); return; }
    try {
      if (!live || peerRef.current?.connectionState !== 'connected') {
        await connect();
        return;
      }
      setTransferNotice(`Opening video ${index + 1} of ${fileQueueRef.current.length}…`);
      await live.replaceVideo(url);
      if (run !== playlistSwitchRunRef.current || phoneVideoStreamRef.current !== live) return;
      for (const sender of peerRef.current?.getSenders() ?? []) {
        if (sender.track?.kind === 'video') {
          void configureVideoSender(sender, live.profile()).catch(error => console.warn('Playlist video encoder tuning unavailable.', error));
        }
      }
      setSentToTv(true);
      setVideoSeekDraft(null);
      setTransferNotice(`Playing video ${index + 1} of ${fileQueueRef.current.length}. The next video starts automatically.`);
    } catch (cause) {
      if (run !== playlistSwitchRunRef.current) return;
      setError(`${cause instanceof Error ? cause.message : 'This video could not be opened.'} Your playlist is kept. Tap this video to retry, or choose Next.`);
    } finally {
      if (run === playlistSwitchRunRef.current) {
        playlistBusyRef.current = false;
        setPlaylistLoading(false);
        if (live && phoneVideoStreamRef.current === live) publishVideoState(live.state());
      }
    }
  };

  playlistEndedRef.current = () => {
    if (playlistBusyRef.current || !pairingActiveRef.current || !phoneVideoStreamRef.current) return;
    const index = videoQueueIndexRef.current;
    const ended = fileQueueRef.current[index];
    if (!ended || ended === lastEndedFileRef.current) return;
    lastEndedFileRef.current = ended;
    const next = playlistNeighbour(fileQueueRef.current.length, index, 1);
    if (next !== null) void playPlaylistItem(next);
    else setTransferNotice('Playlist finished. Choose a video to play again, restart the playlist, or add more videos.');
  };

  const reorderPlaylist = (from: number, to: number) => {
    if (playlistBusyRef.current) return;
    const active = fileQueueRef.current[videoQueueIndexRef.current];
    const next = movePlaylistItem(fileQueueRef.current, from, to);
    fileQueueRef.current = next;
    setFileQueue(next);
    if (phoneVideoStreamRef.current || recoveryWantedRef.current) {
      const index = Math.max(0, next.indexOf(active));
      videoQueueIndexRef.current = index;
      setQueueIndex(index);
      refreshPlaylistNotice(index, next.length);
    } else showPlaylistPreview(0);
  };

  const removePlaylistItem = (index: number) => {
    if (playlistBusyRef.current) return;
    const previous = fileQueueRef.current;
    const active = previous[videoQueueIndexRef.current];
    const next = previous.filter((_, position) => position !== index);
    fileQueueRef.current = next;
    setFileQueue(next);
    if (!next.length) {
      recoveryWantedRef.current = false;
      recoveryRef.current?.cancel();
      stopPeer(true);
      setFile(null);
      setObjectUrl('');
      setMediaKind(null);
      setQueueIndex(0);
      videoQueueIndexRef.current = 0;
      setSentToTv(false);
      setStatus('paired');
      setTransferNotice('');
      setError('');
    } else if (previous[index] === active) {
      if (phoneVideoStreamRef.current) void playPlaylistItem(Math.min(index, next.length - 1));
      else showPlaylistPreview(Math.min(index, next.length - 1));
    } else {
      const activeIndex = Math.max(0, next.indexOf(active));
      videoQueueIndexRef.current = activeIndex;
      setQueueIndex(activeIndex);
      refreshPlaylistNotice(activeIndex, next.length);
    }
  };

  const sendPhotoControl = (action: string) => {
    const channel = controlChannelRef.current;
    if (channel?.readyState === 'open') channel.send(action);
  };

  const requestTvFullscreen = () => {
    const channel = controlChannelRef.current;
    if (channel?.readyState !== 'open') {
      setFullscreenNotice('TV controls are reconnecting. Try again once connected.');
      return;
    }
    if (fullscreenTimerRef.current !== null) clearTimeout(fullscreenTimerRef.current);
    const entering = !tvFullscreen;
    fullscreenRequestRef.current = entering;
    setFullscreenPending(true);
    setFullscreenNotice('');
    channel.send(entering ? 'fullscreen:enter' : 'fullscreen:exit');
    fullscreenTimerRef.current = setTimeout(() => {
      fullscreenTimerRef.current = null;
      fullscreenRequestRef.current = null;
      setFullscreenPending(false);
      setFullscreenNotice('The TV has not confirmed fullscreen. Use Full screen on the TV. If its page is an older version, reload it once to enable phone fullscreen controls.');
    }, 3000);
  };

  const showQueuePhoto = (index: number) => {
    if (index < 0 || index >= sentQueueCount) return;
    const selected = fileQueueRef.current[index];
    if (!selected) return;
    setQueueIndex(index);
    setFile(selected);
    setMediaKind('image');
    setObjectUrl(URL.createObjectURL(selected));
    sendPhotoControl(`photo:show:${index}`);
  };

  const disconnect = () => {
    autoConnectAfterSelectionRef.current = false;
    pairingActiveRef.current = false;
    recoveryWantedRef.current = false;
    recoveryRef.current?.cancel();
    stopPeer(true);
    setIsUrlPlayback(false);
    urlCastActiveRef.current = false;
    fileQueueRef.current = [];
    setFileQueue([]);
    setFile(null);
    setMediaKind(null);
    setProgress(0);
    setSentToTv(false);
    setError('');
    setLocation('/connect');
  };

  const statusCopy = status === 'connected'
    ? sentToTv
      ? error
        ? 'Connected. The TV received the file but could not play it.'
        : mediaKind === 'image' && fileQueue.length > 1
          ? `All ${fileQueue.length} photos are shown on the TV.`
          : `Connected. Your ${mediaKind === 'image' ? 'photo is on' : 'video is playing on'} the TV.`
      : progress >= 99
        ? 'Connected. Waiting for the TV to finish opening the file…'
        : mediaKind === 'image' && fileQueue.length > 1
          ? `Sending photo ${queueIndex + 1} of ${fileQueue.length}${progress ? ` · ${progress}%` : '…'}`
          : `Connected. Sending your ${mediaKind === 'image' ? 'photo' : 'video'} to the TV${progress ? ` · ${progress}%` : '…'}`
    : status === 'connecting'
      ? 'Connecting directly to the TV… Keep this page open.'
      : status === 'paired'
        ? 'Paired with the TV. Choose a photo or video when you’re ready.'
        : status === 'disconnected'
        ? 'Pairing kept. Return to this page to reconnect to the same TV automatically.'
        : status === 'failed'
          ? 'Connection needs attention. Try again when ready.'
          : file ? `Your ${mediaKind === 'image' ? 'photo' : 'video'} is ready to share.` : 'Choose a video or photo stored on this phone.';

  if (!validRoomId) return <div className="app-shell"><BrandHeader phone /><main className="page-wrap"><div className="expired"><CircleAlert size={30} /><h1>That room link is incomplete</h1><p>Scan the pairing code on the TV again to open a fresh connection.</p><Link className="button-secondary" href="/" data-testid="link-return-tv"><ArrowLeft size={15} /> Back to FrameCast</Link></div></main></div>;

  return (
    <div className="app-shell">
      <BrandHeader phone />
      <main className="page-wrap">
        <section className="phone-page fade-in">
          <div className="phone-heading">
            <span className="eyebrow">You’re joining a FrameCast screen</span>
            <h1>Send it to the TV.</h1>
          <p>Select photos or a video playlist stored on this phone, or paste a video link. Local files go directly to the TV; for a link, the TV opens the source itself.</p>
          </div>
          <div className="phone-card">
            {file && objectUrl ? (
              <>
                {mediaKind === 'video' ? (
                  <video
                    ref={videoRef}
                    className="video-preview"
                    src={objectUrl}
                    preload="metadata"
                    controls={!phoneVideoStreamRef.current}
                    playsInline
                    muted={phoneVideoStreamRef.current ? false : muted}
                    onPlay={() => {
                      const graph = phoneAudioGraphRef.current;
                      if (!phoneVideoStreamRef.current && graph?.context.state === 'suspended') {
                        void graph.context.resume().catch(() => setError('Tap Play again to enable preview sound.'));
                      }
                    }}
                    onTimeUpdate={(event) => {
                      const element = event.currentTarget;
                      if (element.duration) setProgress(Math.max(status === 'connected' ? 35 : 0, (element.currentTime / element.duration) * 100));
                    }}
                    aria-label="Local video preview"
                    data-testid="video-local-preview"
                  />
                ) : (
                  <img className="video-preview photo-preview" src={objectUrl} alt={`Selected photo: ${file.name}`} data-testid="image-local-preview" />
                )}
                <div className="file-details">
                  <strong data-testid="text-selected-file">{fileQueue.length > 1 ? `${mediaKind === 'video' ? 'Video' : 'Photo'} ${queueIndex + 1} of ${fileQueue.length} · ${file.name}` : file.name}</strong>
                  <span>{(file.size / 1024 / 1024).toFixed(1)} MB{fileQueue.length > 1 ? ` · ${fileQueue.length} ${mediaKind === 'video' ? 'videos' : 'photos'} selected` : ''}</span>
                </div>
                <button type="button" className="button-quiet" onClick={() => document.getElementById('video-file-input')?.click()} data-testid="button-change-content"><RefreshCw size={14} /> Change selection</button>
              </>
            ) : (
              <label className="dropzone" htmlFor="video-file-input" data-testid="control-content-picker">
                <span className="drop-icon"><FileVideo2 size={22} /><ImageIcon size={17} /></span>
                <strong>Choose up to 30 photos or videos</strong>
                <span>Select photos or a video; playback starts on the TV automatically</span>
              </label>
            )}
            <input
              id="video-file-input"
              className="hidden-file"
              type="file"
              accept="video/*,image/*"
              multiple
              onChange={(event) => {
                // Clearing here can revoke an Android picker grant before transfer.
                void chooseFiles(Array.from(event.currentTarget.files ?? []));
              }}
              aria-label="Choose up to 30 photos or videos"
              data-testid="input-content-file"
            />
            {preparingSelection && <p role="status" data-testid="status-reading-selection">Reading your selection on this phone… Nothing is uploaded.</p>}
            {mediaKind === 'video' && fileQueue.length > 0 && <VideoPlaylist
              files={fileQueue} activeIndex={queueIndex} busy={playlistLoading || preparingSelection || status === 'connecting'}
              playing={Boolean(phoneVideoStreamRef.current) && status === 'connected'}
              onPlay={index => void playPlaylistItem(index)} onMove={reorderPlaylist} onRemove={removePlaylistItem}
              onAdd={files => void chooseFiles(files, true)}
            />}
            <div className="video-link-card" data-testid="video-link-card">
              <label htmlFor="video-link-input">Or paste a YouTube or video link</label>
              <div className="video-link-actions">
                <input
                  id="video-link-input"
                  type="url"
                  value={videoLink}
                  onChange={(event) => {
                    setVideoLink(event.currentTarget.value);
                    setVideoLinkError('');
                  }}
                  placeholder="https://www.youtube.com/watch?v=..."
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  aria-label="Video or webpage link"
                  data-testid="input-video-link"
                />
                <button
                  type="button"
                  className="button-primary"
                  onClick={() => void castVideoLink()}
                  disabled={!videoLink.trim() || checkingVideoLink || preparingSelection || status === 'connecting'}
                  data-testid="button-play-video-link"
                >
                  {checkingVideoLink ? <RefreshCw size={15} className="animate-spin" /> : <Play size={15} />}
                  {checkingVideoLink ? 'Checking link…' : 'Play on TV'}
                </button>
              </div>
              <p className="video-link-help">Copy a YouTube link with Share → Copy link and paste it here. The TV opens YouTube’s official player. Some videos block embedding or autoplay; direct MP4/M3U8 links also work.</p>
              {videoLinkError && <p className="video-link-error" role="alert" data-testid="text-video-link-error">{videoLinkError}</p>}
              {videoLinkError && <button type="button" className="button-secondary video-link-direct" onClick={() => void castVideoLinkDirectly()} disabled={!videoLink.trim() || checkingVideoLink} data-testid="button-try-video-link-direct">Try this link directly</button>}
            </div>
            {file && status === 'connected' && (
              <div className="status-row" aria-label={`Transfer progress ${Math.round(progress)} percent`} data-testid="status-video-progress">
                <span className="status-dot live" />
                <span className="status-text">
                  {sentToTv
                    ? error ? 'Playback needs attention. Your selection is kept.' : fileQueue.length > 1 ? mediaKind === 'video' ? `Video ${queueIndex + 1} of ${fileQueue.length} playing on TV.` : `${fileQueue.length} photos shown on TV.` : `${mediaKind === 'image' ? 'Photo shown' : 'Video playing'} on TV.`
                    : progress >= 99
                      ? 'Transfer complete. Waiting for the TV to open the file…'
                      : mediaKind === 'image' && fileQueue.length > 1
                        ? `Sending photo ${queueIndex + 1} of ${fileQueue.length}${progress ? ` · ${progress}%` : '…'}`
                        : `Connected · sending ${mediaKind === 'image' ? 'photo' : 'video'}${progress ? ` · ${progress}%` : '…'}`}
                </span>
              </div>
            )}
            {transferNotice && status === 'connected' && <p className="support-note" role="status" data-testid="text-transfer-notice">{transferNotice}</p>}
            {isUrlPlayback && status === 'connected' && (
              <div className="status-row" role="status" data-testid="status-video-link">
                <span className="status-dot live" />
                <span className="status-text">{sentToTv ? 'The TV is streaming directly from the link.' : 'Opening the video source on the TV…'}</span>
              </div>
            )}
            <div className="phone-actions">
              {file && (status !== 'paired' || Boolean(error)) && (
                <button type="button" className="button-primary" onClick={() => void (mediaKind === 'video' && fileQueue.length > 1 ? playPlaylistItem(status === 'connected' ? 0 : videoQueueIndexRef.current) : connect())} disabled={playlistLoading || preparingSelection || status === 'connecting' || (status === 'connected' && (!sentToTv || fileQueue.length <= 1))} data-testid="button-connect-tv">
                  {status === 'connecting' ? <RefreshCw size={16} className="animate-spin" /> : status === 'connected' ? <Check size={16} /> : <ArrowUpRight size={16} />}
                  {status === 'connecting'
                    ? 'Connecting…'
                    : status === 'connected'
                      ? sentToTv ? fileQueue.length > 1 ? mediaKind === 'video' ? 'Restart playlist' : `Replay ${fileQueue.length} photos` : mediaKind === 'image' ? 'Photo sent to TV' : 'Sent to TV' : 'Sending to TV…'
                      : status === 'failed' || status === 'disconnected' || error
                        ? 'Try again'
                        : mediaKind === 'image' ? 'Show photo on TV' : fileQueue.length > 1 ? 'Play playlist on TV' : 'Play video on TV'}
                </button>
              )}
              {pairingActiveRef.current && (
                <button type="button" className="button-secondary" onClick={disconnect} data-testid="button-disconnect-tv">
                  <X size={16} /> Disconnect from TV
                </button>
              )}
            </div>
            {status === 'connected' && (
              <div className="video-remote-controls" data-testid="phone-tv-fullscreen-controls">
                <button type="button" className="button-secondary" onClick={requestTvFullscreen} disabled={fullscreenPending}
                  aria-label={tvFullscreen ? 'Exit full screen on TV' : 'Enter full screen on TV'} data-testid="button-phone-tv-fullscreen">
                  {tvFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                  {fullscreenPending ? 'Requesting TV fullscreen…' : tvFullscreen ? 'Exit TV full screen' : 'Full screen on TV'}
                </button>
                {fullscreenNotice && <p className="support-note" role="status" data-testid="text-phone-fullscreen-notice">{fullscreenNotice}</p>}
              </div>
            )}
            {status === 'connected' && mediaKind === 'image' && sentQueueCount > 0 && (
              <div className="photo-remote-controls" data-testid="photo-remote-controls">
                <span className="support-note">Browse and zoom the photos on the TV from here.</span>
                {sentQueueCount > 1 && <div className="photo-remote-navigation">
                  <button type="button" className="button-secondary" onClick={() => showQueuePhoto(queueIndex - 1)} disabled={queueIndex === 0} aria-label="Previous photo on TV" data-testid="button-phone-photo-previous">Back</button>
                  <span aria-live="polite">{queueIndex + 1} / {sentQueueCount}</span>
                  <button type="button" className="button-secondary" onClick={() => showQueuePhoto(queueIndex + 1)} disabled={queueIndex >= sentQueueCount - 1} aria-label="Next photo on TV" data-testid="button-phone-photo-next">Next</button>
                </div>}
                <div className="photo-remote-navigation">
                  <button type="button" className="button-secondary" onClick={() => sendPhotoControl('photo:zoom-out')} aria-label="Zoom out on TV" data-testid="button-phone-photo-zoom-out">−</button>
                  <button type="button" className="button-secondary" onClick={() => sendPhotoControl('photo:zoom-reset')} aria-label="Fit photo on TV" data-testid="button-phone-photo-zoom-reset">Fit</button>
                  <button type="button" className="button-secondary" onClick={() => sendPhotoControl('photo:zoom-in')} aria-label="Zoom in on TV" data-testid="button-phone-photo-zoom-in">+</button>
                </div>
                <div className="photo-remote-navigation" data-testid="photo-remote-pan">
                  <button type="button" className="button-secondary" onClick={() => sendPhotoControl('photo:move-up')} aria-label="Move photo up on TV" data-testid="button-phone-photo-move-up">↑ Move up</button>
                  <button type="button" className="button-secondary" onClick={() => sendPhotoControl('photo:move-down')} aria-label="Move photo down on TV" data-testid="button-phone-photo-move-down">↓ Move down</button>
                </div>
              </div>
            )}
            {status === 'connected' && mediaKind === 'video' && (videoStreaming || sentToTv) && (
              <div className="video-remote-controls" data-testid="video-remote-controls">
                {!isUrlPlayback && <div className="photo-remote-navigation video-fit-options">
                  <button type="button" className="button-secondary" aria-pressed={tvVideoFit === 'cover'} onClick={() => { setTvVideoFit('cover'); sendPhotoControl('video:fit:cover'); }} data-testid="button-phone-video-fill">Fill TV screen</button>
                  <button type="button" className="button-secondary" aria-pressed={tvVideoFit === 'contain'} onClick={() => { setTvVideoFit('contain'); sendPhotoControl('video:fit:contain'); }} data-testid="button-phone-video-fit">Fit whole video</button>
                </div>}
                {!isUrlPlayback && <button type="button" className="button-secondary" onClick={() => sendPhotoControl('video:rotate')} data-testid="button-phone-video-rotate"><RefreshCw size={16} /> Rotate video on TV</button>}
                <div className="photo-remote-navigation">
                  <button type="button" className="button-secondary" onClick={() => sendPhotoControl('video:seek-by:-10')} aria-label="Skip back 10 seconds on TV" data-testid="button-phone-video-back">−10s</button>
                  <button type="button" className="button-secondary" onClick={() => sendPhotoControl(remoteVideoState.paused ? 'play' : 'pause')} aria-label={remoteVideoState.paused ? 'Play video on TV' : 'Pause video on TV'} data-testid="button-phone-video-play-pause">
                    {remoteVideoState.paused ? <Play size={15} /> : <Pause size={15} />}
                    {remoteVideoState.paused ? 'Play' : 'Pause'}
                  </button>
                  <button type="button" className="button-secondary" onClick={() => sendPhotoControl('video:seek-by:10')} aria-label="Skip forward 10 seconds on TV" data-testid="button-phone-video-forward">+10s</button>
                </div>
                <input
                  className="video-seek-slider"
                  type="range"
                  min={0}
                  max={Math.max(1, remoteVideoState.duration)}
                  step={1}
                  value={Math.min(Math.max(1, remoteVideoState.duration), videoSeekDraft ?? remoteVideoState.currentTime)}
                  disabled={remoteVideoState.duration <= 0}
                  aria-label="Seek video on TV"
                  data-testid="slider-phone-video-seek"
                  onChange={(event) => {
                    const target = Number(event.currentTarget.value);
                    setVideoSeekDraft(target);
                    sendPhotoControl(`video:seek:${Math.round(target)}`);
                  }}
                  onPointerUp={() => setVideoSeekDraft(null)}
                  onTouchEnd={() => setVideoSeekDraft(null)}
                />
                <div className="video-time-row">
                  <span>{formatPlaybackTime(videoSeekDraft ?? remoteVideoState.currentTime)} / {formatPlaybackTime(remoteVideoState.duration)}</span>
                  <div className="video-volume-controls">
                    <button type="button" className="button-quiet" onClick={() => sendPhotoControl(`video:volume:${Math.max(0, remoteVideoState.volume - 0.1).toFixed(1)}`)} aria-label="Lower TV volume">Vol−</button>
                    <button type="button" className="button-quiet" onClick={() => sendPhotoControl(`video:volume:${Math.min(1, remoteVideoState.volume + 0.1).toFixed(1)}`)} aria-label="Raise TV volume">Vol+</button>
                    <button type="button" className="button-quiet" onClick={() => sendPhotoControl('video:mute')} aria-label={remoteVideoState.volume <= 0 ? 'Unmute TV' : 'Mute TV'} data-testid="button-phone-video-mute">
                      {remoteVideoState.volume <= 0 ? 'Unmute' : 'Mute'}
                    </button>
                  </div>
                </div>
              </div>
            )}
            <div className="status-row phone-status" role="status" aria-live="polite" data-testid="status-phone-connection">
              <span className={`status-dot${status === 'connected' ? ' live' : ''}`} />
              <span className="status-text">{statusCopy}</span>
            </div>
            {mediaKind === 'video' && <p className="support-note">{phoneVideoStreamRef.current ? `Automatic quality targets ${phoneVideoStreamRef.current.profile().height}p at up to 30 fps. It starts at HD, qualifies higher tiers up to source-limited 4K only with sustained phone, TV and Wi-Fi headroom, and lowers quality if playback struggles. Missing performance data keeps quality conservative. Keep FrameCast visible; video goes directly to the TV with no full-video upload.` : 'Local video playback uses your phone’s video support. Video links are opened by the TV from their original source.'}</p>}
            {streamHealth && phoneVideoStreamRef.current && (
              <p className="support-note" role="status" data-testid="text-stream-performance">
                Phone encoding: {Math.round(streamHealth.encodedFps)} fps
                {streamHealth.width > 0 && streamHealth.height > 0 ? ` at ${streamHealth.width}×${streamHealth.height}` : ''}.
                {streamHealth.receivedFps !== null ? ` TV decoding: ${Math.round(streamHealth.receivedFps)} fps.` : ' Waiting for TV performance feedback.'}
                {streamHealth.limitedBy ? ` Protecting smooth playback (${streamHealth.limitedBy}).` : ''}
              </p>
            )}
            {!fileSupported && <p className="support-note" role="note">This browser does not support local media previews.</p>}
            {error && <div className="error-banner" role="alert" data-testid="text-phone-error">{error}</div>}
            {messagesQuery.isError && <div className="error-banner" role="alert" data-testid="text-phone-poll-error">We can’t reach this pairing room right now. Make sure the TV page is still open.</div>}
          </div>
          <div className="phone-footer"><LockKeyhole size={14} /> Phone files are never uploaded. For a link, the TV fetches from the original site. Pairing expires after 4 hours without activity.</div>
        </section>
      </main>
    </div>
  );
}

function ResponsiveEntryPage() {
  const [phoneSized, setPhoneSized] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 760px)').matches,
  );
  useEffect(() => {
    const media = window.matchMedia('(max-width: 760px)');
    const update = () => setPhoneSized(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return phoneSized ? <PhoneJoinPage /> : <TvPage />;
}

function Router() {
  return (
    // Keep a shared shell (sidebar, navbar) outside the boundary so it
    // survives a page crash.
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={ResponsiveEntryPage} />
        <Route path="/tv" component={TvPage} />
        <Route path="/connect" component={PhoneJoinPage} />
        <Route path="/send/:roomId">
          {(params) => <PhonePage roomId={params.roomId} />}
        </Route>
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
