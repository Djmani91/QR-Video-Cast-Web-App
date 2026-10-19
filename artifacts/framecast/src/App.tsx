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
const rtcConfig: RTCConfiguration = { iceServers: [] };

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

function readableExpiry(expiresAt: string) {
  const date = new Date(expiresAt);
  return Number.isNaN(date.getTime())
    ? 'Temporary room'
    : `Closes ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
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
  const [clock, setClock] = useState(Date.now());
  const [browserFullscreen, setBrowserFullscreen] = useState(false);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const controlChannelRef = useRef<RTCDataChannel | null>(null);
  const mediaObjectUrlRef = useRef('');
  const mediaTransferRef = useRef<{ mimeType: string; kind: MediaKind; size: number; received: number; chunks: ArrayBuffer[] } | null>(null);
  const [receivedImageUrl, setReceivedImageUrl] = useState('');
  const [transferProgress, setTransferProgress] = useState<number | null>(null);
  const seenRef = useRef(new Set<number>());
  const queuedCandidates = useRef<RTCIceCandidateInit[]>([]);
  const roomId = room?.id ?? '';
  const send = useSignalSender(roomId);
  const messagesQuery = useGetCastRoomMessages(roomId, {
    query: {
      queryKey: getGetCastRoomMessagesQueryKey(roomId),
      refetchInterval: 700,
      enabled: Boolean(roomId),
    },
  });
  const messages = messagesQuery.data ?? [];

  const stopPeer = useCallback(() => {
    controlChannelRef.current?.close();
    controlChannelRef.current = null;
    peerRef.current?.getReceivers().forEach((receiver) => receiver.track?.stop());
    peerRef.current?.close();
    peerRef.current = null;
    mediaTransferRef.current = null;
    setTransferProgress(null);
    setReceivedImageUrl('');
    if (mediaObjectUrlRef.current) URL.revokeObjectURL(mediaObjectUrlRef.current);
    mediaObjectUrlRef.current = '';
    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current.removeAttribute('src');
      videoRef.current.load();
    }
  }, []);

  useEffect(() => () => stopPeer(), [stopPeer]);
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
                    let packet: { framecast?: string; mimeType?: string; kind?: MediaKind; size?: number };
                    try {
                      packet = JSON.parse(message.data) as { framecast?: string; mimeType?: string; kind?: MediaKind; size?: number };
                    } catch {
                      setError('The phone sent an unreadable media transfer message.');
                      return;
                    }
                    if (packet.framecast === 'metadata') {
                      if (!packet.size || packet.size > 256 * 1024 * 1024 || !packet.mimeType) {
                        setError('This file is too large or has an unsupported format.');
                        channel.close();
                        return;
                      }
                      mediaTransferRef.current = {
                        mimeType: packet.mimeType,
                        kind: packet.kind === 'image' ? 'image' : 'video',
                        size: packet.size,
                        received: 0,
                        chunks: [],
                      };
                      setMediaKind(packet.kind === 'image' ? 'image' : 'video');
                      setTransferProgress(0);
                      return;
                    }
                    if (packet.framecast === 'complete') {
                      const transfer = mediaTransferRef.current;
                      if (!transfer || transfer.received !== transfer.size) {
                        setError('The media transfer was incomplete. Send the file again.');
                        return;
                      }
                      const url = URL.createObjectURL(new Blob(transfer.chunks, { type: transfer.mimeType }));
                      if (mediaObjectUrlRef.current) URL.revokeObjectURL(mediaObjectUrlRef.current);
                      mediaObjectUrlRef.current = url;
                      if (transfer.kind === 'image') {
                        if (videoRef.current) {
                          videoRef.current.srcObject = null;
                          videoRef.current.removeAttribute('src');
                          videoRef.current.load();
                        }
                        setReceivedImageUrl(url);
                        if (channel.readyState === 'open') channel.send(JSON.stringify({ framecast: 'received', playback: 'displayed' }));
                      } else if (videoRef.current) {
                        setReceivedImageUrl('');
                        videoRef.current.srcObject = null;
                        videoRef.current.src = url;
                        videoRef.current.load();
                        void videoRef.current.play().then(() => {
                          setPlaying(true);
                          if (channel.readyState === 'open') channel.send(JSON.stringify({ framecast: 'received', playback: 'playing' }));
                        }).catch(() => {
                          setPlaying(false);
                          setError('The TV received this video, but its browser could not play the file format. Try an MP4 video encoded with H.264.');
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
                  transfer.chunks.push(message.data);
                  transfer.received += message.data.byteLength;
                  if (transfer.size > 0) {
                    setTransferProgress(Math.min(99, Math.round((transfer.received / transfer.size) * 100)));
                  }
                };
              } else {
                controlChannelRef.current = channel;
                channel.onmessage = (message) => {
                  if (message.data === 'pause' && videoRef.current) {
                    videoRef.current.pause();
                    setPlaying(false);
                  } else if (message.data === 'play' && videoRef.current) {
                    void videoRef.current.play().catch(() => setPlaying(false));
                    setPlaying(true);
                  } else if (message.data === 'stop' && videoRef.current) {
                    videoRef.current.pause();
                    videoRef.current.currentTime = 0;
                    setPlaying(false);
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
    setError('');
    createRoomMutation();
  };
  const reconnect = () => {
    stopPeer();
    setStatus('idle');
    startRoom();
  };
  const phoneUrl = room ? `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, '')}/send/${encodeURIComponent(room.id)}` : '';
  const roomExpired = Boolean(room && new Date(room.expiresAt).getTime() <= clock);
  const statusCopy = status === 'connected'
    ? transferProgress !== null && transferProgress < 100
      ? `Connected. Receiving the guest’s ${mediaKind === 'image' ? 'photo' : 'video'}…`
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
            <p className="hero-intro">Send a photo or video from your phone to this TV browser. No account or video upload needed.</p>
            <div className="trust-line"><ShieldCheck size={17} /> Your files stay on your phone. Content travels directly to this screen.</div>
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
              className={status === 'connected' && (transferProgress === null || (mediaKind === 'video' && transferProgress >= 100)) ? 'video-preview' : 'sr-only'}
              autoPlay
              playsInline
              muted={muted}
              aria-label="Video playing from the guest phone"
              data-testid="video-tv-playback"
            />
            {status === 'connected' && mediaKind === 'image' && receivedImageUrl && (
              <img className="image-preview" src={receivedImageUrl} alt="Photo shared from the guest phone" />
            )}
            {status === 'connected' && transferProgress !== null && transferProgress < 100 && (
              <div className="tv-transfer-status" role="status" data-testid="status-tv-transfer">
                <span className="tv-transfer-spinner" />
                <strong>Receiving {mediaKind === 'image' ? 'photo' : 'video'}</strong>
                <span>{transferProgress}% · keep your devices awake</span>
              </div>
            )}
            {status !== 'connected' && (
              <div className="qr-frame" data-testid="status-pairing-code" aria-label={room ? 'Scan the QR code to pair your phone' : 'Pairing code not created'}>
                {room && !roomExpired
                  ? <QRCodeSVG value={phoneUrl} size={184} level="M" marginSize={1} />
                  : <div className="qr-empty"><Smartphone size={28} /><span>{roomExpired ? 'This pairing code has expired' : 'Your pairing code will appear here'}</span></div>}
              </div>
            )}
              <p className="pair-prompt">{status === 'connected' ? transferProgress !== null && transferProgress < 100 ? 'Receiving directly from the phone. Playback starts when the transfer is complete.' : `Your guest’s ${mediaKind === 'image' ? 'photo' : 'video'} is on the big screen.` : status === 'paired' ? 'Your guest is connected and choosing content on their phone.' : roomExpired ? 'This temporary room has closed. Create a fresh code to pair again.' : room ? 'Scan with your phone camera or enter the code on the join screen.' : 'Preparing a temporary room for this screen…'}</p>
            {!room || status === 'failed' || roomExpired ? (
              <button type="button" className="button-primary" onClick={startRoom} disabled={creatingRoom} data-testid="button-create-room">
                {creatingRoom ? <RefreshCw size={16} className="animate-spin" /> : status === 'failed' || roomExpired ? <RefreshCw size={16} /> : <ArrowUpRight size={16} />}
                {creatingRoom ? 'Preparing your screen…' : status === 'failed' || roomExpired ? 'Create a fresh room' : 'Create pairing code'}
              </button>
            ) : status === 'connected' ? (
              <div className="tv-controls">
                <button className="button-secondary" type="button" onClick={toggleBrowserFullscreen} data-testid="button-tv-fullscreen-playback" aria-label={browserFullscreen ? 'Exit browser full screen' : 'Enter browser full screen'}>
                  {browserFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                  {browserFullscreen ? 'Exit full screen' : 'Full screen'}
                </button>
                {mediaKind === 'video' && <>
                <button className="button-secondary" type="button" onClick={() => {
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
                <button className="button-secondary" type="button" onClick={() => setMuted((value) => !value)} data-testid="button-tv-mute" aria-label={muted ? 'Turn sound on' : 'Mute sound'}>
                  {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}{muted ? 'Sound off' : 'Sound on'}
                </button>
                </>}
                <button className="button-quiet" type="button" onClick={reconnect} data-testid="button-tv-new-room">New room</button>
              </div>
            ) : room ? (
              <button className="button-quiet" type="button" onClick={reconnect} data-testid="button-tv-new-room"><RefreshCw size={14} /> New room</button>
            ) : null}
            {room && <div className="room-meta"><span>CODE <strong className="room-code" data-testid="text-room-code">{room.code}</strong></span><span data-testid="text-room-expiry">{roomExpired ? 'Room expired' : readableExpiry(room.expiresAt)}</span></div>}
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
              <div><strong>Same Wi-Fi, direct connection.</strong><p>Both devices need to be on the same Wi-Fi network. Pairing messages stay in memory for up to 10 minutes; the video or photo streams directly between devices.</p></div>
          </aside>
        </div>
      </main>
    </div>
  );
}

function PhonePage({ roomId }: { roomId?: string }) {
  const validRoomId = roomId ?? '';
  const send = useSignalSender(validRoomId);
  const messagesQuery = useGetCastRoomMessages(validRoomId, {
    query: {
      queryKey: getGetCastRoomMessagesQueryKey(validRoomId),
      refetchInterval: 700,
      enabled: Boolean(validRoomId),
    },
  });
  const [file, setFile] = useState<File | null>(null);
  const [mediaKind, setMediaKind] = useState<MediaKind | null>(null);
  const [objectUrl, setObjectUrl] = useState('');
  const [status, setStatus] = useState<PeerStatus>('idle');
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(0);
  const [sentToTv, setSentToTv] = useState(false);
  const [muted, setMuted] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const mediaChannelRef = useRef<RTCDataChannel | null>(null);
  const controlChannelRef = useRef<RTCDataChannel | null>(null);
  const transferRunRef = useRef(0);
  const transferCompleteRef = useRef(false);
  const seenRef = useRef(new Set<number>());
  const queuedCandidates = useRef<RTCIceCandidateInit[]>([]);
  const messages = messagesQuery.data ?? [];
  const fileSupported = typeof window !== 'undefined' && typeof URL.createObjectURL === 'function';

  const stopPeer = useCallback((sendClose = false) => {
    transferRunRef.current += 1;
    transferCompleteRef.current = true;
    if (sendClose) send('phone', 'close', {});
    mediaChannelRef.current?.close();
    controlChannelRef.current?.close();
    mediaChannelRef.current = null;
    controlChannelRef.current = null;
    peerRef.current?.getSenders().forEach((sender) => sender.track?.stop());
    peerRef.current?.close();
    peerRef.current = null;
  }, [send]);

  useEffect(() => () => {
    stopPeer();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }, [objectUrl, stopPeer]);

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
        setStatus('disconnected');
        setError('The TV ended the direct connection. You can send the media again to reconnect.');
      }
    }
  }, [messages, stopPeer]);

  const chooseFile = (selected?: File) => {
    if (!selected) return;
    const selectedKind: MediaKind | null = selected.type.startsWith('video/')
      ? 'video'
      : selected.type.startsWith('image/') ? 'image' : null;
    if (!selectedKind) {
      setError('Choose a video or photo to send to the TV.');
      return;
    }
    stopPeer(Boolean(peerRef.current));
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    const nextUrl = URL.createObjectURL(selected);
    setFile(selected);
    setMediaKind(selectedKind);
    setObjectUrl(nextUrl);
    setStatus('paired');
    setProgress(0);
    setSentToTv(false);
    setError('');
  };

  const connect = async () => {
    if (!file || !mediaKind) {
      setError('Choose a video or photo first, then connect to the TV.');
      return;
    }
    if (file.size <= 0) {
      setError('This file is empty. Choose a different photo or video.');
      return;
    }
    if (file.size > MAX_MEDIA_SIZE_BYTES) {
      setError('This first version supports files up to 256 MB. Choose a smaller video or photo.');
      return;
    }
    setError('');
    setStatus('connecting');
    setProgress(0);
    setSentToTv(false);
    stopPeer();
    queuedCandidates.current = [];
    transferCompleteRef.current = false;
    const transferRun = transferRunRef.current;
    try {
      const peer = new RTCPeerConnection(rtcConfig);
      peerRef.current = peer;
      const controlChannel = peer.createDataChannel('framecast-control');
      controlChannelRef.current = controlChannel;
      const mediaChannel = peer.createDataChannel('framecast-media');
      mediaChannelRef.current = mediaChannel;
      mediaChannel.binaryType = 'arraybuffer';
      mediaChannel.onmessage = (event) => {
        if (transferRun !== transferRunRef.current) return;
        if (typeof event.data !== 'string') return;
        try {
          const packet = JSON.parse(event.data) as { framecast?: string; playback?: string };
          if (packet.framecast === 'received') {
            transferCompleteRef.current = true;
            setProgress(100);
            setSentToTv(true);
            if (packet.playback === 'failed') {
              setError('The file reached the TV, but its browser could not play this format. Try an MP4 video encoded with H.264.');
            }
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
            const mimeType = getMediaMimeType(file, mediaKind);
            mediaChannel.send(JSON.stringify({
              framecast: 'metadata',
              name: file.name,
              mimeType,
              kind: mediaKind,
              size: file.size,
            }));
            let lastProgressUpdate = 0;
            for (let offset = 0; offset < file.size; offset += MEDIA_CHUNK_SIZE_BYTES) {
              if (transferRun !== transferRunRef.current) return;
              await waitForDataChannelBuffer(mediaChannel);
              const chunk = await file.slice(offset, Math.min(offset + MEDIA_CHUNK_SIZE_BYTES, file.size)).arrayBuffer();
              if (transferRun !== transferRunRef.current) return;
              mediaChannel.send(chunk);
              const sentBytes = Math.min(offset + chunk.byteLength, file.size);
              const now = Date.now();
              if (now - lastProgressUpdate > 120 || sentBytes === file.size) {
                setProgress(Math.min(99, Math.round((sentBytes / file.size) * 100)));
                lastProgressUpdate = now;
              }
            }
            await waitForDataChannelBuffer(mediaChannel);
            if (transferRun === transferRunRef.current) {
              mediaChannel.send(JSON.stringify({ framecast: 'complete' }));
              setProgress(99);
            }
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
          setError('A direct connection could not be made. Check that both devices are on the same Wi-Fi network.');
        } else if (peer.connectionState === 'connecting') {
          setStatus('connecting');
        }
      };
      const offer = await peer.createOffer();
      if (transferRun !== transferRunRef.current) return;
      await peer.setLocalDescription(offer);
      if (transferRun !== transferRunRef.current) return;
      send('phone', 'offer', { type: offer.type, sdp: offer.sdp, mediaKind, transport: 'data-channel' });
    } catch (connectionError) {
      if (transferRun !== transferRunRef.current) return;
      stopPeer();
      setStatus('failed');
      setError(connectionError instanceof Error ? connectionError.message : 'Could not start a direct connection to the TV.');
    }
  };

  const disconnect = () => {
    stopPeer(true);
    setStatus('disconnected');
    setProgress(0);
    setSentToTv(false);
    setError('');
  };

  const statusCopy = status === 'connected'
    ? sentToTv
      ? error
        ? 'Connected. The TV received the file but could not play it.'
        : `Connected. Your ${mediaKind === 'image' ? 'photo is on' : 'video is playing on'} the TV.`
      : progress >= 99
        ? 'Connected. Waiting for the TV to finish opening the file…'
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
            <p>Choose a video or photo on this phone. It sends directly to the TV—your file stays right here. Keep both devices on the same Wi-Fi network.</p>
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
                <div className="file-details"><strong data-testid="text-selected-file">{file.name}</strong><span>{(file.size / 1024 / 1024).toFixed(1)} MB</span></div>
                <button type="button" className="button-quiet" onClick={() => document.getElementById('video-file-input')?.click()} data-testid="button-change-content"><RefreshCw size={14} /> Choose different content</button>
              </>
            ) : (
              <label className="dropzone" htmlFor="video-file-input" data-testid="control-content-picker">
                <span className="drop-icon"><FileVideo2 size={22} /><ImageIcon size={17} /></span>
                <strong>Choose a photo or video</strong>
                <span>Media stays on your phone and is sent directly to the TV</span>
              </label>
            )}
            <input
              id="video-file-input"
              className="hidden-file"
              type="file"
              accept="video/*,image/*"
              onChange={(event) => chooseFile(event.currentTarget.files?.[0])}
              aria-label="Choose a photo or video"
              data-testid="input-content-file"
            />
            {file && status === 'connected' && (
              <div className="status-row" aria-label={`Transfer progress ${Math.round(progress)} percent`} data-testid="status-video-progress">
                <span className="status-dot live" />
                <span className="status-text">
                  {sentToTv
                    ? error ? 'TV received the file but could not play it.' : `${mediaKind === 'image' ? 'Photo shown' : 'Video playing'} on TV.`
                    : progress >= 99
                      ? 'Transfer complete. Waiting for the TV to open the file…'
                      : `Connected · sending ${mediaKind === 'image' ? 'photo' : 'video'}${progress ? ` · ${progress}%` : '…'}`}
                </span>
              </div>
            )}
            <div className="phone-actions">
              {file && (
                <button type="button" className="button-primary" onClick={connect} disabled={status === 'connecting' || status === 'connected'} data-testid="button-connect-tv">
                  {status === 'connecting' ? <RefreshCw size={16} className="animate-spin" /> : status === 'connected' ? <Check size={16} /> : <ArrowUpRight size={16} />}
                  {status === 'connecting'
                    ? 'Connecting…'
                    : status === 'connected'
                      ? sentToTv ? (mediaKind === 'image' ? 'Photo sent to TV' : 'Sent to TV') : 'Sending to TV…'
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
            <div className="status-row phone-status" role="status" aria-live="polite" data-testid="status-phone-connection">
              <span className={`status-dot${status === 'connected' ? ' live' : ''}`} />
              <span className="status-text">{statusCopy}</span>
            </div>
            {!fileSupported && <p className="support-note" role="note">This browser does not support local media previews.</p>}
            {error && <div className="error-banner" role="alert" data-testid="text-phone-error">{error}</div>}
            {messagesQuery.isError && <div className="error-banner" role="alert" data-testid="text-phone-poll-error">We can’t reach this pairing room right now. Make sure the TV page is still open.</div>}
          </div>
          <div className="phone-footer"><LockKeyhole size={14} /> Photos and videos are never uploaded. Pairing signals are temporary and cleared after 10 minutes.</div>
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
