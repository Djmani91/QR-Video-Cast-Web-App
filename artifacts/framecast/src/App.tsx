import { type FormEvent, type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
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
import { remuxAndSendMp4 } from './lib/mp4-remux';
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
  const [room, setRoom] = useState<{ id: string; code: string; expiresAt: string } | null>(null);
  const [status, setStatus] = useState<PeerStatus>('idle');
  const [mediaKind, setMediaKind] = useState<MediaKind>('video');
  const [error, setError] = useState('');
  const [muted, setMuted] = useState(true);
  const [playing, setPlaying] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [youtubeVideoId, setYoutubeVideoId] = useState<string | null>(null);
  const youtubePlayerRef = useRef<YouTubePlayerApi | null>(null);
  const youtubeMediaChannelRef = useRef<RTCDataChannel | null>(null);
  const [clock, setClock] = useState(Date.now());
  const [browserFullscreen, setBrowserFullscreen] = useState(false);
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
  useEffect(() => {
    if (imageZoom === 1) setImageOffsetY(0);
  }, [imageZoom]);
  const seenRef = useRef(new Set<number>());
  const queuedCandidates = useRef<RTCIceCandidateInit[]>([]);
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
  const messagesQuery = useGetCastRoomMessages(roomId, {
    query: {
      queryKey: getGetCastRoomMessagesQueryKey(roomId),
      refetchInterval: 700,
      enabled: Boolean(roomId),
    },
  });
  const messages = messagesQuery.data?.messages ?? [];

  const stopPeer = useCallback(() => {
    controlChannelRef.current?.close();
    controlChannelRef.current = null;
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
      currentTime: video.currentTime,
      duration: Number.isFinite(video.duration) ? video.duration : 0,
      paused: video.paused,
      volume: video.muted ? 0 : video.volume,
    }));
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
    const events = ['timeupdate', 'play', 'pause', 'durationchange', 'volumechange', 'seeked', 'loadedmetadata'];
    for (const eventName of events) video.addEventListener(eventName, update);
    return () => {
      for (const eventName of events) video.removeEventListener(eventName, update);
    };
  }, [sendVideoState]);
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
    const updateFullscreenState = () => setBrowserFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', updateFullscreenState);
    return () => document.removeEventListener('fullscreenchange', updateFullscreenState);
  }, []);
  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 15000);
    return () => window.clearInterval(timer);
  }, []);

  const toggleBrowserFullscreen = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {
        setError('This TV browser could not exit full screen. Use its Back or Exit key.');
      });
      return;
    }
    if (!document.documentElement.requestFullscreen) {
      setError('This TV browser does not support full screen. Playback will still fill the FrameCast page.');
      return;
    }
    void document.documentElement.requestFullscreen().catch(() => {
      setError('Use the TV remote to select Full screen. The video will still fill the FrameCast page.');
    });
  };
  useEffect(() => {
    if (!createdRoom) return;
    setRoom(createdRoom);
    setStatus('idle');
    seenRef.current.clear();
    queuedCandidates.current = [];
  }, [createdRoom]);
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
      if (signal.from !== 'phone' || seenRef.current.has(signal.sequence)) continue;
      seenRef.current.add(signal.sequence);
      if (signal.type === 'ready') {
        const connectionState = peerRef.current?.connectionState;
        if (!peerRef.current || connectionState === 'failed' || connectionState === 'disconnected' || connectionState === 'closed') {
          if (peerRef.current) {
            stopPeer();
            queuedCandidates.current = [];
          }
          setError('');
          setStatus('paired');
        }
      } else if (signal.type === 'offer') {
        void (async () => {
          try {
            setError('');
            setMediaKind(signal.payload.mediaKind === 'image' ? 'image' : 'video');
            stopPeer();
            const peer = new RTCPeerConnection(rtcConfig);
            peerRef.current = peer;
            peer.ondatachannel = (event) => {
              const channel = event.channel;
              if (channel.label === 'framecast-media') {
                channel.binaryType = 'arraybuffer';
                channel.onmessage = (message) => {
                  if (typeof message.data === 'string') {
                    let packet: { framecast?: string; name?: string; itemId?: string; previewDataUrl?: string; mimeType?: string; kind?: MediaKind; size?: number; sizeUnknown?: boolean; streamCandidate?: boolean; url?: string };
                    try {
                      packet = JSON.parse(message.data) as { framecast?: string; name?: string; itemId?: string; previewDataUrl?: string; mimeType?: string; kind?: MediaKind; size?: number; streamCandidate?: boolean; url?: string };
                    } catch {
                      setError('The phone sent an unreadable media transfer message.');
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
                        setPhotoPreviewVisible(true);
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
                        void video.play().then(() => {
                          setPlaying(true);
                          if (channel.readyState === 'open') channel.send(JSON.stringify({ framecast: 'streaming' }));
                        }).catch(() => {
                          setError('The TV browser needs a tap to start this video. Use the Play button on the TV screen.');
                          if (channel.readyState === 'open') channel.send(JSON.stringify({ framecast: 'streaming' }));
                        });
                      }, { once: true });
                      video.load();
                      return;
                    }
                    if (packet.framecast === 'metadata') {
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
                              void video.play().then(() => {
                                setPlaying(true);
                                if (channel.readyState === 'open') channel.send(JSON.stringify({ framecast: 'streaming' }));
                              }).catch(() => {
                                setError('The TV browser needs a tap to start this video. Use the Play button on the TV screen.');
                                if (channel.readyState === 'open') channel.send(JSON.stringify({ framecast: 'streaming' }));
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
                        }).catch(() => {
                          setPlaying(false);
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
                  const command = String(message.data);
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
                  } else if (command === 'video:mute' && videoRef.current) {
                    videoRef.current.muted = !videoRef.current.muted;
                    setMuted(videoRef.current.muted);
                  }
                };
              }
            };
            peer.ontrack = (event) => {
              if (videoRef.current) {
                videoRef.current.srcObject = event.streams[0] ?? new MediaStream([event.track]);
                void videoRef.current.play().catch(() => setPlaying(false));
              }
            };
            peer.onicecandidate = (event) => {
              if (event.candidate) send('tv', 'ice', { ...event.candidate.toJSON() });
            };
            peer.onconnectionstatechange = () => {
              if (peer.connectionState === 'connected') setStatus('connected');
              else if (peer.connectionState === 'disconnected') setStatus('disconnected');
              else if (peer.connectionState === 'failed') {
                setStatus('failed');
                setError('The direct connection was interrupted. Ask the guest to reconnect.');
              } else if (peer.connectionState === 'connecting') setStatus('connecting');
            };
            await peer.setRemoteDescription(new RTCSessionDescription(signal.payload as unknown as RTCSessionDescriptionInit));
            for (const candidate of queuedCandidates.current.splice(0)) {
              await peer.addIceCandidate(new RTCIceCandidate(candidate));
            }
            const answer = await peer.createAnswer();
            await peer.setLocalDescription(answer);
            send('tv', 'answer', { type: answer.type, sdp: answer.sdp });
            setStatus('connecting');
          } catch (negotiationError) {
            console.error('FrameCast TV could not negotiate the direct connection:', negotiationError);
            stopPeer();
            queuedCandidates.current = [];
            setStatus('failed');
            setError('The direct connection setup failed. Create a fresh room on the TV, then scan its new code from the phone.');
          }
        })();
      } else if (signal.type === 'ice') {
        const candidate = signal.payload as RTCIceCandidateInit;
        if (peerRef.current?.remoteDescription) {
          void peerRef.current.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => undefined);
        } else {
          queuedCandidates.current.push(candidate);
        }
      } else if (signal.type === 'close') {
        stopPeer();
        setError('');
        setStatus('paired');
      }
    }
  }, [messages, roomId, send, stopPeer]);

  const startRoom = () => {
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
    ? transferProgress !== null && transferProgress < 100
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
        ? 'Connection paused. Waiting for the phone to come back online.'
        : status === 'failed'
          ? 'Connection failed. Create a fresh room, then scan the new code.'
          : room ? 'Ready when you are. Scan the code with your phone camera.' : 'Create a private room to pair your phone with this screen.';

  return (
    <div className={`app-shell${status === 'connected' ? ' tv-immersive-playback' : ''}`}>
      <BrandHeader />
      <main className="page-wrap fade-in">
        <div className="hero-grid">
          <section className="hero-copy">
            <span className="eyebrow">A better way to share the big screen</span>
            <h1 className="hero-title">Your photos &amp; videos.<br /><em>The big screen.</em></h1>
            <p className="hero-intro">Send a photo or video from your phone, or open a video link on this TV browser. No account or media upload needed.</p>
            <div className="trust-line"><ShieldCheck size={17} /> Phone files go directly to this screen. Video links are fetched by the TV from their source.</div>
          </section>

          <section className="pair-card" aria-label="TV pairing and playback">
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
            <video
              ref={videoRef}
              className={!youtubeVideoId && status === 'connected' && (transferProgress === null || (mediaKind === 'video' && (transferProgress >= 100 || videoStreamActive))) ? 'video-preview' : 'sr-only'}
              autoPlay
              playsInline
              muted={muted}
              aria-label="Video playing from the guest phone"
              data-testid="video-tv-playback"
            />
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
            {status === 'connected' && transferProgress !== null && transferProgress < 100 && (
              <div className="tv-transfer-status" role="status" data-testid="status-tv-transfer">
                <span className="tv-transfer-spinner" />
                <strong>Receiving {mediaKind === 'image' ? 'photo' : 'video'}</strong>
                <span>{videoStreamActive ? `Playing while transfer continues · ${transferProgress}%` : `${transferProgress}% · keep your devices awake`}</span>
              </div>
            )}
            {status !== 'connected' && (
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
  const [videoLink, setVideoLink] = useState('');
  const [videoLinkError, setVideoLinkError] = useState('');
  const [checkingVideoLink, setCheckingVideoLink] = useState(false);
  const [isUrlPlayback, setIsUrlPlayback] = useState(false);
  const [queueIndex, setQueueIndex] = useState(0);
  const [sentQueueCount, setSentQueueCount] = useState(0);
  const [mediaKind, setMediaKind] = useState<MediaKind | null>(null);
  const [objectUrl, setObjectUrl] = useState('');
  const [status, setStatus] = useState<PeerStatus>('idle');
  const [error, setError] = useState('');
  const [transferNotice, setTransferNotice] = useState('');
  const [progress, setProgress] = useState(0);
  const [sentToTv, setSentToTv] = useState(false);
  const [videoStreaming, setVideoStreaming] = useState(false);
  const [remoteVideoState, setRemoteVideoState] = useState({ currentTime: 0, duration: 0, paused: true, volume: 0 });
  const [videoSeekDraft, setVideoSeekDraft] = useState<number | null>(null);
  const [muted, setMuted] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const mediaChannelRef = useRef<RTCDataChannel | null>(null);
  const controlChannelRef = useRef<RTCDataChannel | null>(null);
  const transferRunRef = useRef(0);
  const urlCastActiveRef = useRef(false);
  const transferCompleteRef = useRef(false);
  const mediaAckResolverRef = useRef<((playback: string) => void) | null>(null);
  const videoStreamingRef = useRef(false);
  const fileQueueRef = useRef<File[]>([]);
  const seenRef = useRef(new Set<number>());
  const queuedCandidates = useRef<RTCIceCandidateInit[]>([]);
  const messages = messagesQuery.data?.messages ?? [];
  const fileSupported = typeof window !== 'undefined' && typeof URL.createObjectURL === 'function';

  const stopPeer = useCallback((sendClose = false) => {
    transferRunRef.current += 1;
    transferCompleteRef.current = true;
    urlCastActiveRef.current = false;
    videoStreamingRef.current = false;
    setVideoStreaming(false);
    setRemoteVideoState({ currentTime: 0, duration: 0, paused: true, volume: 0 });
    setVideoSeekDraft(null);
    mediaAckResolverRef.current?.('interrupted');
    mediaAckResolverRef.current = null;
    if (sendClose) send('phone', 'close', {});
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
        void (async () => {
          try {
            const peer = peerRef.current;
            if (!peer) return;
            await peer.setRemoteDescription(new RTCSessionDescription(signal.payload as unknown as RTCSessionDescriptionInit));
            for (const candidate of queuedCandidates.current.splice(0)) {
              await peer.addIceCandidate(new RTCIceCandidate(candidate));
            }
          } catch {
            setStatus('failed');
            setError('The TV could not complete the connection. Try connecting again.');
          }
        })();
      } else if (signal.type === 'ice') {
        const candidate = signal.payload as RTCIceCandidateInit;
        if (peerRef.current?.remoteDescription) {
          void peerRef.current.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => undefined);
        } else {
          queuedCandidates.current.push(candidate);
        }
      } else if (signal.type === 'close') {
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

  const chooseFiles = (selected?: FileList | File[]) => {
    if (!selected?.length) return;
    const chosen = Array.from(selected);
    if (chosen.length > 30) {
      setError('Choose up to 30 photos at a time.');
      return;
    }
    const selectedKinds = chosen.map((item) => item.type.startsWith('video/')
      ? 'video'
      : item.type.startsWith('image/') ? 'image' : null);
    if (selectedKinds.some((kind) => kind === null)
      || selectedKinds.some((kind) => kind !== selectedKinds[0])
      || (selectedKinds[0] === 'video' && chosen.length > 1)) {
      setError('Choose up to 30 photos together, or choose one video.');
      return;
    }
    const selectedKind = selectedKinds[0] as MediaKind;
    if (selectedKind === 'image' && chosen.reduce((total, item) => total + item.size, 0) > MAX_MEDIA_QUEUE_SIZE_BYTES) {
      setError('The selected photos must total 256 MB or less. Choose fewer photos.');
      return;
    }
    if (selectedKind === 'video' && chosen[0].size > MAX_VIDEO_SIZE_BYTES) {
      setError('Videos must be 8 GB or smaller to stream directly.');
      return;
    }
    stopPeer(Boolean(peerRef.current));
    setIsUrlPlayback(false);
    urlCastActiveRef.current = false;
    setVideoLinkError('');
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    const nextUrl = URL.createObjectURL(chosen[0]);
    fileQueueRef.current = chosen;
    setFileQueue(chosen);
    setQueueIndex(0);
    setSentQueueCount(0);
    setFile(chosen[0]);
    setMediaKind(selectedKind);
    setObjectUrl(nextUrl);
    setStatus('paired');
    setProgress(0);
    setSentToTv(false);
    videoStreamingRef.current = false;
    setVideoStreaming(false);
    setError('');
  };

  const connect = async (remoteUrl?: string) => {
    const castUrl = remoteUrl ? normalizeVideoLink(remoteUrl) : null;
    const queuedFiles = castUrl ? [] : fileQueueRef.current.length ? fileQueueRef.current : file ? [file] : [];
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
    setTransferNotice('');
    setStatus('connecting');
    setProgress(0);
    setSentToTv(false);
    setIsUrlPlayback(Boolean(castUrl));
    videoStreamingRef.current = false;
    setVideoStreaming(false);
    setQueueIndex(0);
    setSentQueueCount(0);
    stopPeer();
    urlCastActiveRef.current = Boolean(castUrl);
    queuedCandidates.current = [];
    transferCompleteRef.current = false;
    const transferRun = transferRunRef.current;
    try {
      const peer = new RTCPeerConnection(rtcConfig);
      peerRef.current = peer;
      const controlChannel = peer.createDataChannel('framecast-control');
      controlChannelRef.current = controlChannel;
      controlChannel.onmessage = (event) => {
        if (typeof event.data !== 'string') return;
        try {
          const packet = JSON.parse(event.data) as { framecast?: string; currentTime?: number; duration?: number; paused?: boolean; volume?: number };
          if (packet.framecast === 'video-state') {
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
            setTransferNotice('');
            if (urlCastActiveRef.current) {
              transferCompleteRef.current = true;
              setProgress(100);
              setSentToTv(true);
            }
          }
          if (packet.framecast === 'stream-error') {
            setError(packet.message || 'This video cannot stream in the TV browser. Choose a stream-ready H.264/AAC fragmented MP4.');
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
              setError('The video reached the TV, but its browser could not play it. Try standard H.264 MP4 at 30 or 60 fps; some HEVC or high-frame-rate videos are not supported by TV browsers.');
            }
            if (packet.playback === 'playing') {
              videoStreamingRef.current = true;
              setVideoStreaming(true);
              setTransferNotice('The TV started the video after the full transfer.');
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
              mediaChannel.send(JSON.stringify({ framecast: 'remote-video', url: castUrl }));
              return;
            }
            for (let index = 0; index < queuedFiles.length; index += 1) {
              if (transferRun !== transferRunRef.current) return;
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
               const streamCandidate = kind === 'video'
                 && (mimeType === 'video/mp4' || mimeType === 'video/quicktime' || /\.(mp4|mov)$/i.test(outgoing.name));
              let lastProgressUpdate = 0;
               let remuxedForStreaming = false;
               if (streamCandidate) {
                 setTransferNotice('Preparing this video for direct streaming on your phone…');
                 const remuxResult = await remuxAndSendMp4({
                   file: outgoing,
                   channel: mediaChannel,
                   name: outgoing.name,
                   originalSize: outgoing.size,
                   isCancelled: () => transferRun !== transferRunRef.current,
                   waitForBuffer: () => waitForDataChannelBuffer(mediaChannel),
                   onProgress: (bytes) => setProgress(Math.min(99, Math.round((bytes / outgoing.size) * 100))),
                 });
                 if (remuxResult === 'cancelled') return;
                 if (remuxResult === 'sent') {
                   remuxedForStreaming = true;
                   setTransferNotice('The phone prepared a streamable copy and is sending it directly to the TV.');
                 } else if (remuxResult === 'unsupported' && outgoing.size > BUFFERED_VIDEO_FALLBACK_MAX_BYTES) {
                   throw new Error('This large video could not be prepared for instant streaming. Try an MP4 or MOV with its playback index near the start of the file.');
                 }
               }
               if (!remuxedForStreaming) {
                 mediaChannel.send(JSON.stringify({
                   framecast: 'metadata',
                   name: outgoing.name,
                   itemId,
                   mimeType,
                   kind,
                   size: outgoing.size,
                   streamCandidate,
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
               if (!remuxedForStreaming) {
                 await waitForDataChannelBuffer(mediaChannel);
                 mediaChannel.send(JSON.stringify({ framecast: 'complete' }));
               }
              if (kind === 'video') {
                const startDeadline = Date.now() + 20_000;
                while (!videoStreamingRef.current && transferRun === transferRunRef.current && Date.now() < startDeadline) {
                  await new Promise((resolve) => window.setTimeout(resolve, 150));
                }
                if (transferRun !== transferRunRef.current) return;
                if (!videoStreamingRef.current) {
                  throw new Error('The TV did not start the video. Check the format and keep both devices awake.');
                }
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
            setStatus('failed');
            setError(transferError instanceof Error ? transferError.message : 'The file could not be sent directly. Try again.');
          }
        })();
      };
      mediaChannel.onclose = () => {
        if (transferRun !== transferRunRef.current || transferCompleteRef.current) return;
        setStatus((current) => current === 'failed' ? current : 'disconnected');
        setError((current) => current || 'The direct connection ended before the file reached the TV. Keep both devices awake and try again.');
      };
      peer.onicecandidate = (event) => {
        if (transferRun !== transferRunRef.current) return;
        if (event.candidate) send('phone', 'ice', { ...event.candidate.toJSON() });
      };
      peer.onconnectionstatechange = () => {
        if (transferRun !== transferRunRef.current) return;
        if (peer.connectionState === 'connected') {
          setStatus('connected');
        } else if (peer.connectionState === 'disconnected') {
          setStatus('disconnected');
          setError('The direct connection was interrupted. Reconnect and try again.');
        } else if (peer.connectionState === 'failed') {
          setStatus('failed');
          setError('A direct connection failed. Your router may block devices from talking to each other. Check that neither device is on guest Wi-Fi or a VPN, and that Wi-Fi client isolation is off. FrameCast does not relay media.');
        } else if (peer.connectionState === 'connecting') {
          setStatus('connecting');
        }
      };
      const offer = await peer.createOffer();
      if (transferRun !== transferRunRef.current) return;
      await peer.setLocalDescription(offer);
      if (transferRun !== transferRunRef.current) return;
      send('phone', 'offer', { type: offer.type, sdp: offer.sdp, mediaKind: castUrl ? 'video' : mediaKind, transport: 'data-channel' });
    } catch (connectionError) {
      if (transferRun !== transferRunRef.current) return;
      stopPeer();
      setStatus('failed');
      setError(connectionError instanceof Error ? connectionError.message : 'Could not start a direct connection to the TV.');
    }
  };

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

  const sendPhotoControl = (action: string) => {
    const channel = controlChannelRef.current;
    if (channel?.readyState === 'open') channel.send(action);
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
        : fileQueue.length > 1
          ? `All ${fileQueue.length} photos are shown on the TV.`
          : `Connected. Your ${mediaKind === 'image' ? 'photo is on' : 'video is playing on'} the TV.`
      : progress >= 99
        ? 'Connected. Waiting for the TV to finish opening the file…'
        : fileQueue.length > 1
          ? `Sending photo ${queueIndex + 1} of ${fileQueue.length}${progress ? ` · ${progress}%` : '…'}`
          : `Connected. Sending your ${mediaKind === 'image' ? 'photo' : 'video'} to the TV${progress ? ` · ${progress}%` : '…'}`
    : status === 'connecting'
      ? 'Connecting directly to the TV… Keep this page open.'
      : status === 'paired'
        ? 'Paired with the TV. Choose a photo or video when you’re ready.'
        : status === 'disconnected'
        ? 'Disconnected from the TV. Choose Send to reconnect.'
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
          <p>Select photos or a video stored on this phone, or paste a video link. Local files go directly to the TV; for a link, the TV opens the source itself.</p>
          </div>
          <div className="phone-card">
            {file && objectUrl ? (
              <>
                {mediaKind === 'video' ? (
                  <video
                    ref={videoRef}
                    className="video-preview"
                    src={objectUrl}
                    controls
                    playsInline
                    muted={muted}
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
                  <strong data-testid="text-selected-file">{fileQueue.length > 1 ? `Photo ${queueIndex + 1} of ${fileQueue.length}` : file.name}</strong>
                  <span>{(file.size / 1024 / 1024).toFixed(1)} MB{fileQueue.length > 1 ? ` · ${fileQueue.length} photos selected` : ''}</span>
                </div>
                <button type="button" className="button-quiet" onClick={() => document.getElementById('video-file-input')?.click()} data-testid="button-change-content"><RefreshCw size={14} /> Change selection</button>
              </>
            ) : (
              <label className="dropzone" htmlFor="video-file-input" data-testid="control-content-picker">
                <span className="drop-icon"><FileVideo2 size={22} /><ImageIcon size={17} /></span>
                <strong>Choose up to 30 photos, or one video</strong>
                <span>Photos are sent in order without reopening the library</span>
              </label>
            )}
            <input
              id="video-file-input"
              className="hidden-file"
              type="file"
              accept="video/*,image/*"
              multiple
              onChange={(event) => {
                chooseFiles(event.currentTarget.files ?? undefined);
                event.currentTarget.value = '';
              }}
              aria-label="Choose up to 30 photos or one video"
              data-testid="input-content-file"
            />
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
                  disabled={!videoLink.trim() || checkingVideoLink || status === 'connecting'}
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
                    ? error ? 'TV received the file but could not play it.' : fileQueue.length > 1 ? `${fileQueue.length} photos shown on TV.` : `${mediaKind === 'image' ? 'Photo shown' : 'Video playing'} on TV.`
                    : progress >= 99
                      ? 'Transfer complete. Waiting for the TV to open the file…'
                      : fileQueue.length > 1
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
              {file && (
                <button type="button" className="button-primary" onClick={() => void connect()} disabled={status === 'connecting' || (status === 'connected' && (!sentToTv || fileQueue.length <= 1))} data-testid="button-connect-tv">
                  {status === 'connecting' ? <RefreshCw size={16} className="animate-spin" /> : status === 'connected' ? <Check size={16} /> : <ArrowUpRight size={16} />}
                  {status === 'connecting'
                    ? 'Connecting…'
                    : status === 'connected'
                      ? sentToTv ? fileQueue.length > 1 ? `Replay ${fileQueue.length} photos` : mediaKind === 'image' ? 'Photo sent to TV' : 'Sent to TV' : 'Sending to TV…'
                      : status === 'failed' || status === 'disconnected'
                        ? 'Try again'
                        : mediaKind === 'image' ? 'Show photo on TV' : 'Play video on TV'}
                </button>
              )}
              {(status === 'connecting' || status === 'connected') && (
                <button type="button" className="button-secondary" onClick={disconnect} data-testid="button-disconnect-tv">
                  <X size={16} /> Disconnect from TV
                </button>
              )}
              {file && mediaKind === 'video' && <button type="button" className="button-secondary" onClick={() => setMuted((value) => !value)} data-testid="button-phone-mute" aria-label={muted ? 'Enable preview sound' : 'Mute preview'}>
                {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}{muted ? 'Preview muted' : 'Preview sound on'}
              </button>}
            </div>
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
            {mediaKind === 'video' && <p className="support-note">MP4/MOV files are prepared on the phone for streaming. Other small videos transfer first; the TV must support the codec.</p>}
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
