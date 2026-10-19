import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import {
  getGetCastRoomMessagesQueryKey,
  useCreateCastRoom,
  useGetCastRoomMessages,
  useSendCastRoomMessage,
  type CastSignalType,
} from '@workspace/api-client-react';
import { QRCodeSVG } from 'qrcode.react';
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  CircleAlert,
  FileVideo2,
  LockKeyhole,
  Monitor,
  Pause,
  Play,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Volume2,
  VolumeX,
  Wifi,
} from 'lucide-react';
import {
  Link,
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

const queryClient = new QueryClient();

type PeerStatus = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'failed';
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

function TvPage() {
  const createRoom = useCreateCastRoom();
  const [room, setRoom] = useState<{ id: string; expiresAt: string } | null>(null);
  const [status, setStatus] = useState<PeerStatus>('idle');
  const [error, setError] = useState('');
  const [muted, setMuted] = useState(true);
  const [playing, setPlaying] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [clock, setClock] = useState(Date.now());
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const controlChannelRef = useRef<RTCDataChannel | null>(null);
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
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => () => stopPeer(), [stopPeer]);
  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 15000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!createRoom.data) return;
    setRoom(createRoom.data);
    setStatus('idle');
    seenRef.current.clear();
    queuedCandidates.current = [];
  }, [createRoom.data]);
  useEffect(() => {
    if (createRoom.isError) setError('A pairing room could not be created. Check your connection and try again.');
  }, [createRoom.isError]);

  useEffect(() => {
    if (!roomId) return;
    for (const signal of messages) {
      if (signal.from !== 'phone' || seenRef.current.has(signal.sequence)) continue;
      seenRef.current.add(signal.sequence);
      if (signal.type === 'ready') {
        setStatus((current) => current === 'connected' ? current : 'connecting');
      } else if (signal.type === 'offer') {
        void (async () => {
          try {
            setError('');
            stopPeer();
            const peer = new RTCPeerConnection(rtcConfig);
            peerRef.current = peer;
            peer.ondatachannel = (event) => {
              controlChannelRef.current = event.channel;
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
          } catch {
            setStatus('failed');
            setError('We could not establish this connection. Try creating a fresh room.');
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
        setStatus('idle');
      }
    }
  }, [messages, roomId, send, stopPeer]);

  const startRoom = () => {
    setError('');
    createRoom.mutate();
  };
  const reconnect = () => {
    stopPeer();
    setStatus('idle');
    startRoom();
  };
  const phoneUrl = room ? `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, '')}/send/${encodeURIComponent(room.id)}` : '';
  const roomExpired = Boolean(room && new Date(room.expiresAt).getTime() <= clock);
  const statusCopy = status === 'connected'
    ? 'Connected. The guest’s video is playing directly on this screen.'
    : status === 'connecting'
      ? 'A guest is here. Making a direct connection…'
      : status === 'disconnected'
        ? 'Connection paused. Waiting for the phone to come back online.'
        : status === 'failed'
          ? 'Connection lost. Start a new room to try again.'
          : room ? 'Ready when you are. Scan the code with your phone camera.' : 'Create a private room to pair your phone with this screen.';

  return (
    <div className="app-shell">
      <BrandHeader />
      <main className="page-wrap fade-in">
        <div className="hero-grid">
          <section className="hero-copy">
            <span className="eyebrow">A better way to share the big screen</span>
            <h1 className="hero-title">Your video.<br /><em>The big screen.</em></h1>
            <p className="hero-intro">Send a video from your phone to this TV browser in a few seconds. No app, account, or video upload needed.</p>
            <div className="trust-line"><ShieldCheck size={17} /> Your file stays on your phone. The video travels directly to this screen.</div>
          </section>

          <section className="pair-card" aria-label="TV pairing and playback">
            <div className="card-heading">
              <div><span className="eyebrow">This screen</span><h2>Pair a phone</h2></div>
              <span className="screen-chip"><Monitor size={13} /> TV browser</span>
            </div>
            <video
              ref={videoRef}
              className={status === 'connected' ? 'video-preview' : 'sr-only'}
              autoPlay
              playsInline
              muted={muted}
              aria-label="Video playing from the guest phone"
              data-testid="video-tv-playback"
            />
            {status !== 'connected' && (
              <div className="qr-frame" data-testid="status-pairing-code" aria-label={room ? 'Scan the QR code to pair your phone' : 'Pairing code not created'}>
                {room && !roomExpired
                  ? <QRCodeSVG value={phoneUrl} size={184} level="M" marginSize={1} />
                  : <div className="qr-empty"><Smartphone size={28} /><span>{roomExpired ? 'This pairing code has expired' : 'Your pairing code will appear here'}</span></div>}
              </div>
            )}
            <p className="pair-prompt">{status === 'connected' ? 'Your guest’s video is on the big screen.' : roomExpired ? 'This temporary room has closed. Create a fresh code to pair again.' : room ? 'Open your camera and scan this code to choose a video.' : 'Create a temporary room, then scan its code with your phone.'}</p>
            {!room || status === 'failed' || roomExpired ? (
              <button type="button" className="button-primary" onClick={startRoom} disabled={createRoom.isPending} data-testid="button-create-room">
                {createRoom.isPending ? <RefreshCw size={16} className="animate-spin" /> : status === 'failed' || roomExpired ? <RefreshCw size={16} /> : <ArrowUpRight size={16} />}
                {createRoom.isPending ? 'Preparing your screen…' : status === 'failed' || roomExpired ? 'Create a fresh room' : 'Create pairing code'}
              </button>
            ) : status === 'connected' ? (
              <div className="tv-controls">
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
                <button className="button-quiet" type="button" onClick={reconnect} data-testid="button-tv-new-room">New room</button>
              </div>
            ) : room ? (
              <button className="button-quiet" type="button" onClick={reconnect} data-testid="button-tv-new-room"><RefreshCw size={14} /> New room</button>
            ) : null}
            {room && <div className="room-meta"><span>ROOM <strong>{room.id.slice(0, 8).toUpperCase()}</strong></span><span data-testid="text-room-expiry">{roomExpired ? 'Room expired' : readableExpiry(room.expiresAt)}</span></div>}
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
              <div className="step"><span className="step-number">03</span><strong>Play it on the TV</strong></div>
            </div>
          </section>
            <aside className="privacy-note">
            <LockKeyhole size={18} />
              <div><strong>The video stays off our server.</strong><p>Only temporary pairing and network setup messages pass through FrameCast. They stay in memory for up to 10 minutes; the video streams directly between devices.</p></div>
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
  const [objectUrl, setObjectUrl] = useState('');
  const [status, setStatus] = useState<PeerStatus>('idle');
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(0);
  const [muted, setMuted] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const seenRef = useRef(new Set<number>());
  const queuedCandidates = useRef<RTCIceCandidateInit[]>([]);
  const messages = messagesQuery.data ?? [];
  const captureSupported = typeof HTMLVideoElement !== 'undefined' &&
    ('captureStream' in HTMLVideoElement.prototype || 'mozCaptureStream' in HTMLVideoElement.prototype) &&
    typeof RTCPeerConnection !== 'undefined';
  const fileSupported = typeof document !== 'undefined' && 'URL' in window && typeof MediaStream !== 'undefined';

  const stopPeer = useCallback((sendClose = false) => {
    if (sendClose) send('phone', 'close', {});
    peerRef.current?.getSenders().forEach((sender) => sender.track?.stop());
    peerRef.current?.close();
    peerRef.current = null;
  }, [send]);

  useEffect(() => () => {
    stopPeer();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }, [objectUrl, stopPeer]);

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
        setStatus('idle');
      }
    }
  }, [messages, stopPeer]);

  const chooseFile = (selected?: File) => {
    if (!selected) return;
    if (!selected.type.startsWith('video/')) {
      setError('Choose a video file to send to the TV.');
      return;
    }
    stopPeer(true);
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    const nextUrl = URL.createObjectURL(selected);
    setFile(selected);
    setObjectUrl(nextUrl);
    setStatus('idle');
    setProgress(0);
    setError('');
  };

  const connect = async () => {
    const video = videoRef.current;
    if (!file || !video) {
      setError('Choose a video first, then connect to the TV.');
      return;
    }
    if (!captureSupported) {
      setError('This browser cannot stream video directly to the TV. Try a current version of Safari, Chrome, or Firefox.');
      return;
    }
    setError('');
    setStatus('connecting');
    stopPeer();
    seenRef.current.clear();
    queuedCandidates.current = [];
    try {
      await video.play();
      const videoElement = video as HTMLVideoElement & {
        captureStream?: () => MediaStream;
        mozCaptureStream?: () => MediaStream;
      };
      const stream = videoElement.captureStream?.() ?? videoElement.mozCaptureStream?.();
      if (!stream || stream.getTracks().length === 0) throw new Error('Capture stream unavailable');
      const peer = new RTCPeerConnection(rtcConfig);
      peerRef.current = peer;
      const controlChannel = peer.createDataChannel('framecast-control');
      controlChannel.onmessage = (event) => {
        const sourceVideo = videoRef.current;
        if (event.data === 'pause') sourceVideo?.pause();
        if (event.data === 'play' && sourceVideo) void sourceVideo.play();
      };
      stream.getTracks().forEach((track) => peer.addTrack(track, stream));
      peer.onicecandidate = (event) => {
        if (event.candidate) send('phone', 'ice', { ...event.candidate.toJSON() });
      };
      peer.onconnectionstatechange = () => {
        if (peer.connectionState === 'connected') {
          setStatus('connected');
          setProgress(100);
        } else if (peer.connectionState === 'disconnected') {
          setStatus('disconnected');
        } else if (peer.connectionState === 'failed') {
          setStatus('failed');
          setError('The direct connection dropped. Check that both devices are online and reconnect.');
        } else if (peer.connectionState === 'connecting') {
          setStatus('connecting');
        }
      };
      send('phone', 'ready', {});
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      send('phone', 'offer', { type: offer.type, sdp: offer.sdp });
      setProgress(35);
    } catch {
      setStatus('failed');
      setError('The video could not be streamed from this browser. Try another video or a supported browser.');
    }
  };

  const statusCopy = status === 'connected'
    ? 'You’re connected. The video is playing on the TV.'
    : status === 'connecting'
      ? 'Connecting directly to the TV… Keep this page open.'
      : status === 'disconnected'
        ? 'Connection paused. Keep both devices awake and nearby.'
        : status === 'failed'
          ? 'Connection needs attention. Try again when ready.'
          : file ? 'Your video is ready to send.' : 'Choose a video stored on this phone.';

  if (!validRoomId) return <div className="app-shell"><BrandHeader phone /><main className="page-wrap"><div className="expired"><CircleAlert size={30} /><h1>That room link is incomplete</h1><p>Scan the pairing code on the TV again to open a fresh connection.</p><Link className="button-secondary" href="/" data-testid="link-return-tv"><ArrowLeft size={15} /> Back to FrameCast</Link></div></main></div>;

  return (
    <div className="app-shell">
      <BrandHeader phone />
      <main className="page-wrap">
        <section className="phone-page fade-in">
          <div className="phone-heading">
            <span className="eyebrow">You’re joining a FrameCast screen</span>
            <h1>Send it to the TV.</h1>
            <p>Choose a video on this phone. It streams straight to the TV—your file stays right here. Keep both devices on the same Wi-Fi network.</p>
          </div>
          <div className="phone-card">
            {file && objectUrl ? (
              <>
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
                <div className="file-details"><strong data-testid="text-selected-file">{file.name}</strong><span>{(file.size / 1024 / 1024).toFixed(1)} MB</span></div>
                <button type="button" className="button-quiet" onClick={() => document.getElementById('video-file-input')?.click()} data-testid="button-change-video"><RefreshCw size={14} /> Choose a different video</button>
              </>
            ) : (
              <label className="dropzone" htmlFor="video-file-input" data-testid="control-video-picker">
                <span className="drop-icon"><FileVideo2 size={22} /></span>
                <strong>Choose a video from this phone</strong>
                <span>MP4, MOV, WebM and other browser-supported formats</span>
              </label>
            )}
            <input
              id="video-file-input"
              className="hidden-file"
              type="file"
              accept="video/*"
              onChange={(event) => chooseFile(event.currentTarget.files?.[0])}
              aria-label="Choose a video file"
              data-testid="input-video-file"
            />
            {file && status === 'connected' && (
              <div className="status-row" aria-label={`Video progress ${Math.round(progress)} percent`} data-testid="status-video-progress">
                <span className="status-dot live" />
                <span className="status-text">Playing on TV · {Math.round(progress)}% through</span>
              </div>
            )}
            <div className="phone-actions">
              {file && (
                <button type="button" className="button-primary" onClick={connect} disabled={!captureSupported || status === 'connecting' || status === 'connected'} data-testid="button-connect-tv">
                  {status === 'connecting' ? <RefreshCw size={16} className="animate-spin" /> : status === 'connected' ? <Check size={16} /> : <ArrowUpRight size={16} />}
                  {status === 'connecting' ? 'Connecting…' : status === 'connected' ? 'Playing on the TV' : status === 'failed' ? 'Try connecting again' : 'Play video on TV'}
                </button>
              )}
              {file && <button type="button" className="button-secondary" onClick={() => setMuted((value) => !value)} data-testid="button-phone-mute" aria-label={muted ? 'Enable preview sound' : 'Mute preview'}>
                {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}{muted ? 'Preview muted' : 'Preview sound on'}
              </button>}
            </div>
            <div className="status-row phone-status" role="status" aria-live="polite" data-testid="status-phone-connection">
              <span className={`status-dot${status === 'connected' ? ' live' : ''}`} />
              <span className="status-text">{statusCopy}</span>
            </div>
            {!captureSupported && <p className="support-note" role="note" data-testid="text-browser-support">Direct video streaming is not supported in this browser. Please open this link in a recent Safari, Chrome, or Firefox browser.</p>}
            {!fileSupported && <p className="support-note" role="note">This browser does not support local video previews.</p>}
            {error && <div className="error-banner" role="alert" data-testid="text-phone-error">{error}</div>}
            {messagesQuery.isError && <div className="error-banner" role="alert" data-testid="text-phone-poll-error">We can’t reach this pairing room right now. Make sure the TV page is still open.</div>}
          </div>
          <div className="phone-footer"><LockKeyhole size={14} /> The video is never uploaded. Pairing signals are temporary and cleared after 10 minutes.</div>
        </section>
      </main>
    </div>
  );
}

function Router() {
  return (
    // Keep a shared shell (sidebar, navbar) outside the boundary so it
    // survives a page crash.
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={TvPage} />
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
