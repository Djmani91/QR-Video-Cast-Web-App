import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { File as ExpoFile, Paths } from 'expo-file-system';
import { Ionicons } from '@expo/vector-icons';
import { remuxAndSendMp4 } from '@/lib/mp4-remux';
import { getYouTubeVideoId } from '@/lib/youtube';
import { useColors } from '@/hooks/useColors';
import {
  getGetCastRoomMessagesQueryKey,
  useGetCastRoomMessages,
  useLookupCastRoomByCode,
  useSendCastRoomMessage,
  type CastSignalType,
} from '@workspace/api-client-react';

type SelectedMedia = {
  uri: string;
  name: string;
  mimeType: string;
  kind: 'video' | 'image';
  size?: number;
  temporaryCopy?: boolean;
};

async function makePickerAssetReadable(uri: string, name: string) {
  if (Platform.OS !== 'android' || !uri.startsWith('content://')) {
    return { uri, temporaryCopy: false, size: undefined as number | undefined };
  }

  const extension = name.match(/\.[a-z0-9]{1,8}$/i)?.[0] ?? '';
  const cacheFile = new ExpoFile(
    Paths.cache,
    `framecast-transfer-${Date.now()}-${Math.random().toString(36).slice(2, 9)}${extension}`,
  );
  try {
    await new ExpoFile(uri).copy(cacheFile);
    if (!cacheFile.exists || cacheFile.size <= 0) {
      throw new Error('The temporary file copy was empty.');
    }
    return { uri: cacheFile.uri, temporaryCopy: true, size: cacheFile.size };
  } catch {
    try {
      if (cacheFile.exists) cacheFile.delete();
    } catch {
      // Keep the original picker error out of the UI; the temporary copy is best-effort cleanup.
    }
    throw new Error('Android could not keep access to this selected file. Choose it again, or download it to the phone first if it is cloud-only.');
  }
}

type DataChannelLike = {
  label: string;
  readyState: string;
  bufferedAmount: number;
  bufferedAmountLowThreshold: number;
  send(data: string | ArrayBuffer | ArrayBufferView): void;
  close(): void;
  addEventListener(type: string, listener: (event: any) => void): void;
  removeEventListener(type: string, listener: (event: any) => void): void;
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: (() => void) | null;
};

type PeerLike = {
  connectionState: string;
  remoteDescription: unknown;
  onicecandidate: ((event: { candidate: { toJSON(): Record<string, unknown> } | null }) => void) | null;
  onconnectionstatechange: (() => void) | null;
  ondatachannel: ((event: { channel: DataChannelLike }) => void) | null;
  createDataChannel(label: string): DataChannelLike;
  createOffer(): Promise<{ type: string; sdp?: string }>;
  setLocalDescription(description: { type: string; sdp?: string }): Promise<void>;
  setRemoteDescription(description: { type: string; sdp?: string }): Promise<void>;
  addIceCandidate(candidate: unknown): Promise<void>;
  close(): void;
};

type SignalMessage = {
  sequence: number;
  from: 'tv' | 'phone';
  type: CastSignalType;
  payload: Record<string, unknown>;
};

// STUN helps peers discover a direct route; no TURN server is configured, so media is never relayed.
const rtcConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
const FILE_CHUNK_SIZE = 32 * 1024;
const MAX_TRANSFER_BYTES = 256 * 1024 * 1024;
const MAX_VIDEO_SIZE_BYTES = 8 * 1024 * 1024 * 1024;
const BUFFERED_VIDEO_FALLBACK_MAX_BYTES = 128 * 1024 * 1024;

function createPeerConnection(): PeerLike {
  if (Platform.OS === 'web') {
    const BrowserPeer = (globalThis as unknown as { RTCPeerConnection?: new (config: typeof rtcConfig) => PeerLike }).RTCPeerConnection;
    if (!BrowserPeer) throw new Error('WebRTC is unavailable in this browser.');
    return new BrowserPeer(rtcConfig);
  }
  const nativeWebRTC = require('react-native-webrtc') as {
    RTCPeerConnection: new (config: typeof rtcConfig) => PeerLike;
  };
  return new nativeWebRTC.RTCPeerConnection(rtcConfig);
}

function waitForBuffer(channel: DataChannelLike) {
  if (channel.bufferedAmount < 512 * 1024) return Promise.resolve();
  channel.bufferedAmountLowThreshold = 256 * 1024;
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      channel.removeEventListener('bufferedamountlow', onLow);
      reject(new Error('The direct connection stopped accepting data.'));
    }, 15_000);
    const onLow = () => {
      clearTimeout(timeout);
      channel.removeEventListener('bufferedamountlow', onLow);
      resolve();
    };
    channel.addEventListener('bufferedamountlow', onLow);
  });
}

async function createPhotoPreviewDataUrl(uri: string): Promise<string | undefined> {
  try {
    let result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 480 } }],
      { compress: 0.3, format: ImageManipulator.SaveFormat.JPEG, base64: true },
    );
    if (!result.base64 || result.base64.length > 58_000) {
      result = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 320 } }],
        { compress: 0.2, format: ImageManipulator.SaveFormat.JPEG, base64: true },
      );
    }
    return result.base64 && result.base64.length <= 58_000
      ? `data:image/jpeg;base64,${result.base64}`
      : undefined;
  } catch {
    return undefined;
  }
}

function getRoomIdFromQr(value: string): string | null {
  if (/^\d{5}$/.test(value.trim())) return null;
  try {
    const parsed = new URL(value);
    const match = parsed.pathname.match(/\/send\/([^/]+)\/?$/);
    return match?.[1] ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 100 * 1024 * 1024 ? 0 : 1)} MB`;
}

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
  const timeout = setTimeout(() => controller.abort(), 8000);
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
    if (contentLength > 5 * 1024 * 1024) throw new Error('This webpage is too large to inspect in the app.');
    const html = await response.text();
    if (html.length > 5 * 1024 * 1024) throw new Error('This webpage is too large to inspect in the app.');
    const videoUrl = findVideoUrlInPage(html, url);
    if (videoUrl) return videoUrl;
    throw new Error('No directly playable video was found. Try a direct MP4/M3U8 link; sign-in or protected streams may not work.');
  } finally {
    clearTimeout(timeout);
  }
}

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const lookupRoom = useLookupCastRoomByCode();
  const sendSignalMutation = useSendCastRoomMessage();
  const sendSignalRef = useRef(sendSignalMutation.mutate);
  sendSignalRef.current = sendSignalMutation.mutate;
  const [code, setCode] = useState('');
  const [scanning, setScanning] = useState(false);
  const [roomId, setRoomId] = useState('');
  const [selectedMedia, setSelectedMedia] = useState<SelectedMedia | null>(null);
  const [mediaQueue, setMediaQueue] = useState<SelectedMedia[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const [sentQueueCount, setSentQueueCount] = useState(0);
  const [queueRunning, setQueueRunning] = useState(false);
  const [error, setError] = useState('');
  const [transferNotice, setTransferNotice] = useState('');
  const [videoLink, setVideoLink] = useState('');
  const [videoLinkError, setVideoLinkError] = useState('');
  const [checkingVideoLink, setCheckingVideoLink] = useState(false);
  const [isUrlPlayback, setIsUrlPlayback] = useState(false);
  const [videoStreaming, setVideoStreaming] = useState(false);
  const [stage, setStage] = useState<'join' | 'paired' | 'connecting' | 'sending' | 'sent'>('join');
  const [sentBytes, setSentBytes] = useState(0);
  const [totalBytes, setTotalBytes] = useState(0);
  const [paused, setPaused] = useState(false);
  const [preparingMedia, setPreparingMedia] = useState(false);
  const [remoteVideoPosition, setRemoteVideoPosition] = useState({ currentTime: 0, duration: 0, volume: 0 });
  const [videoSeekDraft, setVideoSeekDraft] = useState<number | null>(null);
  const transferComplete = useRef(false);
  const peerRef = useRef<PeerLike | null>(null);
  const mediaChannelRef = useRef<DataChannelLike | null>(null);
  const controlChannelRef = useRef<DataChannelLike | null>(null);
  const mediaQueueRef = useRef<SelectedMedia[]>([]);
  const temporaryMediaUrisRef = useRef(new Set<string>());
  const queueIndexRef = useRef(0);
  const queueRunningRef = useRef(false);
  const transferRunRef = useRef(0);
  const urlCastActiveRef = useRef(false);
  const mediaAckResolverRef = useRef<((playback: string) => void) | null>(null);
  const videoStreamingRef = useRef(false);
  const seenMessages = useRef(new Set<number>());
  const queuedIce = useRef<Record<string, unknown>[]>([]);
  const scanHandled = useRef(false);

  const cleanupTemporaryCopies = useCallback((keepUris: Set<string> = new Set()) => {
    for (const uri of temporaryMediaUrisRef.current) {
      if (keepUris.has(uri)) continue;
      try {
        const file = new ExpoFile(uri);
        if (file.exists) file.delete();
      } catch {
        // Temporary cache cleanup must not block disconnecting or selecting new media.
      }
      temporaryMediaUrisRef.current.delete(uri);
    }
  }, []);

  const messagesQuery = useGetCastRoomMessages(roomId, {
    query: {
      queryKey: getGetCastRoomMessagesQueryKey(roomId),
      refetchInterval: 700,
      enabled: Boolean(roomId),
    },
  });
  const messages = (messagesQuery.data?.messages ?? []) as SignalMessage[];

  const sendSignal = useCallback((type: CastSignalType, payload: Record<string, unknown> = {}) => {
    if (!roomId) return;
    sendSignalRef.current(
      { roomId, data: { from: 'phone', type, payload } },
      { onError: () => setError('The TV connection signal could not be sent. Check both devices are online and try again.') },
    );
  }, [roomId]);

  const closePeer = useCallback((notifyTv = false) => {
    transferRunRef.current += 1;
    urlCastActiveRef.current = false;
    mediaAckResolverRef.current?.('interrupted');
    mediaAckResolverRef.current = null;
    videoStreamingRef.current = false;
    setVideoStreaming(false);
    setRemoteVideoPosition({ currentTime: 0, duration: 0, volume: 0 });
    setVideoSeekDraft(null);
    if (notifyTv && roomId) sendSignal('close', {});
    transferComplete.current = true;
    mediaChannelRef.current?.close();
    controlChannelRef.current?.close();
    mediaChannelRef.current = null;
    controlChannelRef.current = null;
    peerRef.current?.close();
    peerRef.current = null;
  }, [roomId, sendSignal]);

  useEffect(() => () => {
    mediaChannelRef.current?.close();
    controlChannelRef.current?.close();
    peerRef.current?.close();
    cleanupTemporaryCopies();
  }, [cleanupTemporaryCopies]);

  useEffect(() => {
    if (!roomId) return;
    seenMessages.current.clear();
    queuedIce.current = [];
    setStage('paired');
    setError('');
    sendSignal('ready', {});
  }, [roomId, sendSignal]);

  useEffect(() => {
    for (const signal of messages) {
      if (signal.from !== 'tv' || seenMessages.current.has(signal.sequence)) continue;
      seenMessages.current.add(signal.sequence);
      if (signal.type === 'answer') {
        void (async () => {
          try {
            const peer = peerRef.current;
            if (!peer) return;
            await peer.setRemoteDescription(signal.payload as unknown as { type: string; sdp?: string });
            for (const candidate of queuedIce.current.splice(0)) {
              await peer.addIceCandidate(candidate);
            }
          } catch {
            setStage('paired');
            setError('The TV could not finish connecting. Create a fresh code on the TV and try again.');
            closePeer();
          }
        })();
      } else if (signal.type === 'ice') {
        const candidate = signal.payload;
        if (peerRef.current?.remoteDescription) {
          void peerRef.current.addIceCandidate(candidate).catch(() => undefined);
        } else {
          queuedIce.current.push(candidate);
        }
      } else if (signal.type === 'close') {
        closePeer();
        setIsUrlPlayback(false);
        urlCastActiveRef.current = false;
        if (signal.payload.reason === 'new-room') {
          cleanupTemporaryCopies();
          setRoomId('');
          setSelectedMedia(null);
          setMediaQueue([]);
          mediaQueueRef.current = [];
          setSentQueueCount(0);
          queueRunningRef.current = false;
          setQueueRunning(false);
          setStage('join');
          setError('The TV started a new room. Scan its new code to reconnect.');
        } else {
          setStage('paired');
          setError('The TV ended this connection.');
        }
      }
    }
  }, [messages, closePeer, cleanupTemporaryCopies]);

  const joinRoom = (id: string) => {
    if (!id) {
      setError('That QR code does not contain a FrameCast room. Scan the code shown on the TV.');
      return;
    }
    closePeer(Boolean(peerRef.current));
    cleanupTemporaryCopies();
    setIsUrlPlayback(false);
    urlCastActiveRef.current = false;
    setRoomId(id);
    setSelectedMedia(null);
    setMediaQueue([]);
    mediaQueueRef.current = [];
    queueRunningRef.current = false;
    setQueueRunning(false);
    setQueueIndex(0);
    setSentQueueCount(0);
    setStage('paired');
    setSentBytes(0);
    setTotalBytes(0);
    setError('');
    setScanning(false);
  };

  const handleScan = (value: string) => {
    if (scanHandled.current) return;
    scanHandled.current = true;
    setScanning(false);
    const directRoomId = getRoomIdFromQr(value);
    if (directRoomId) {
      joinRoom(directRoomId);
      return;
    }
    if (/^\d{5}$/.test(value.trim())) {
      setCode(value.trim());
      lookupRoom.mutate({ data: { code: value.trim() } }, {
        onSuccess: (result) => joinRoom(result.roomId),
        onError: () => setError('That five-digit code is invalid or has expired. Check the TV screen and try again.'),
      });
      return;
    }
    setError('That QR code is not a FrameCast pairing code.');
  };

  const startScanner = async () => {
    setError('');
    if (!cameraPermission?.granted) {
      const permission = await requestCameraPermission();
      if (!permission.granted) {
        setError('Camera access is needed to scan the TV code. You can still enter the five-digit code.');
        return;
      }
    }
    scanHandled.current = false;
    setScanning(true);
  };

  const submitCode = () => {
    Keyboard.dismiss();
    setError('');
    if (!/^\d{5}$/.test(code)) {
      setError('Enter all five digits shown on the TV.');
      return;
    }
    lookupRoom.mutate({ data: { code } }, {
      onSuccess: (result) => joinRoom(result.roomId),
      onError: () => setError('That code is invalid or has expired. Check the TV screen and try again.'),
    });
  };

  const selectMedia = (queue: SelectedMedia[]) => {
    if (!queue.length) return;
    cleanupTemporaryCopies(new Set(queue.filter((media) => media.temporaryCopy).map((media) => media.uri)));
    setIsUrlPlayback(false);
    urlCastActiveRef.current = false;
    setVideoLinkError('');
    queueRunningRef.current = false;
    setQueueRunning(false);
    closePeer(true);
    mediaQueueRef.current = queue;
    queueIndexRef.current = 0;
    setMediaQueue(queue);
    setQueueIndex(0);
    setSentQueueCount(0);
    setSelectedMedia(queue[0]);
    setStage('paired');
    setSentBytes(0);
    setTotalBytes(0);
    setError('');
  };

  const pickPhotos = async (append = false) => {
    setError('');
    const existingPhotos = append ? mediaQueueRef.current.filter((media) => media.kind === 'image') : [];
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        allowsMultipleSelection: true,
        selectionLimit: 30,
        quality: 0.85,
      });
      if (result.canceled || !result.assets?.length) return;
      if (existingPhotos.length + result.assets.length > 30) {
        setError('Choose up to 30 photos in one queue. Remove some and try again.');
        return;
      }
      setPreparingMedia(true);
      const pickedPhotos: SelectedMedia[] = [];
      for (const [index, asset] of result.assets.entries()) {
        const name = asset.fileName || `Photo ${index + 1}`;
        const cached = await makePickerAssetReadable(asset.uri, name);
        if (cached.temporaryCopy) temporaryMediaUrisRef.current.add(cached.uri);
        pickedPhotos.push({
          uri: cached.uri,
          name,
          mimeType: asset.mimeType || 'image/jpeg',
          kind: 'image',
          size: cached.size ?? asset.fileSize ?? undefined,
          temporaryCopy: cached.temporaryCopy,
        });
      }
      selectMedia([...existingPhotos, ...pickedPhotos]);
    } catch (mediaError) {
      cleanupTemporaryCopies(new Set(mediaQueueRef.current.map((media) => media.uri)));
      setError(mediaError instanceof Error ? mediaError.message : 'Could not read the selected photos. Choose them again and retry.');
    } finally {
      setPreparingMedia(false);
    }
  };

  const pickVideo = async () => {
    setError('');
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['videos'],
        allowsEditing: false,
        selectionLimit: 1,
        quality: 1,
      });
      if (result.canceled || !result.assets?.[0]) return;
      setPreparingMedia(true);
      const asset = result.assets[0];
      const name = asset.fileName || 'Video';
      const cached = await makePickerAssetReadable(asset.uri, name);
      if (cached.temporaryCopy) temporaryMediaUrisRef.current.add(cached.uri);
      selectMedia([{
        uri: cached.uri,
        name,
        mimeType: asset.mimeType || 'video/mp4',
        kind: 'video',
        size: cached.size ?? asset.fileSize ?? undefined,
        temporaryCopy: cached.temporaryCopy,
      }]);
    } catch (mediaError) {
      cleanupTemporaryCopies(new Set(mediaQueueRef.current.map((media) => media.uri)));
      setError(mediaError instanceof Error ? mediaError.message : 'Could not read the selected video. Choose it again and retry.');
    } finally {
      setPreparingMedia(false);
    }
  };

  const castVideoLink = async () => {
    setVideoLinkError('');
    setCheckingVideoLink(true);
    Keyboard.dismiss();
    try {
      const resolvedUrl = await resolveVideoLink(videoLink);
      await startTransfer(resolvedUrl);
    } catch (linkError) {
      setVideoLinkError(linkError instanceof TypeError
        ? 'The page could not be checked. Paste a direct video link, or try casting this link directly.'
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
    Keyboard.dismiss();
    try {
      await startTransfer(normalizeVideoLink(videoLink));
    } catch (linkError) {
      setVideoLinkError(linkError instanceof Error ? linkError.message : 'Paste a complete video link.');
    } finally {
      setCheckingVideoLink(false);
    }
  };

  const startTransfer = async (remoteUrl?: string) => {
    const castUrl = remoteUrl ? normalizeVideoLink(remoteUrl) : null;
    const queue = castUrl ? [] : mediaQueueRef.current.length ? mediaQueueRef.current : selectedMedia ? [selectedMedia] : [];
    if (!roomId || (!castUrl && !queue.length)) {
      setError('Choose photos or a video first.');
      return;
    }
    if (castUrl) {
      cleanupTemporaryCopies();
      const hostname = new URL(castUrl).hostname;
      setSelectedMedia({ uri: castUrl, name: hostname || 'Video link', mimeType: 'video/url', kind: 'video' });
      setMediaQueue([]);
      mediaQueueRef.current = [];
      setIsUrlPlayback(true);
    } else {
      setIsUrlPlayback(false);
    }
    setError('');
    setVideoLinkError('');
    setStage('connecting');
    setSentBytes(0);
    setTotalBytes(0);
    queueRunningRef.current = !castUrl && queue.length > 1;
    setQueueRunning(queueRunningRef.current);
    setSentQueueCount(0);
    closePeer();
    urlCastActiveRef.current = Boolean(castUrl);
    const transferRun = transferRunRef.current;
    queuedIce.current = [];
    try {
      let totalQueueBytes = 0;
      for (const media of castUrl ? [] : queue) {
        const queuedFile = new ExpoFile(media.uri);
        const queuedSize = queuedFile.size || media.size || 0;
        if (!queuedSize) throw new Error(`Could not read “${media.name}”. Choose it again and retry.`);
        const sizeLimit = media.kind === 'video' ? MAX_VIDEO_SIZE_BYTES : MAX_TRANSFER_BYTES;
        if (queuedSize > sizeLimit) {
          throw new Error(media.kind === 'video' ? 'Videos must be 8 GB or smaller to stream directly.' : 'Photos must be under 256 MB each.');
        }
        totalQueueBytes += queuedSize;
        if (media.kind === 'image' && totalQueueBytes > MAX_TRANSFER_BYTES) {
          throw new Error('The selected photos must total 256 MB or less. Choose fewer photos.');
        }
      }
      videoStreamingRef.current = false;
      setVideoStreaming(false);
      setTransferNotice('');
      transferComplete.current = false;

      const peer = createPeerConnection();
      peerRef.current = peer;
      const mediaChannel = peer.createDataChannel('framecast-media');
      mediaChannelRef.current = mediaChannel;
      mediaChannel.onmessage = (event) => {
        if (typeof event.data !== 'string') return;
        try {
          const packet = JSON.parse(event.data) as { framecast?: string; playback?: string; message?: string };
          if (packet.framecast === 'streaming') {
            videoStreamingRef.current = true;
            setVideoStreaming(true);
            setTransferNotice('');
            if (urlCastActiveRef.current) {
              transferComplete.current = true;
              setStage('sent');
            }
          }
          if (packet.framecast === 'stream-error') {
            setError(packet.message || 'This video cannot stream in the TV browser. Choose a stream-ready H.264/AAC fragmented MP4.');
            setTransferNotice('');
            urlCastActiveRef.current = false;
            setStage('paired');
            closePeer();
            return;
          }
          if (packet.framecast === 'received') {
            if (packet.playback === 'playing') {
              videoStreamingRef.current = true;
              setVideoStreaming(true);
              setTransferNotice('The TV started the video after the full transfer.');
            }
            const resolve = mediaAckResolverRef.current;
            mediaAckResolverRef.current = null;
            resolve?.(packet.playback ?? 'displayed');
          }
          if (packet.framecast === 'buffered') {
            setTransferNotice(packet.message || 'This video will start after the transfer finishes.');
          }
        } catch {
          // Ignore non-protocol messages on the media channel.
        }
      };
      const controlChannel = peer.createDataChannel('framecast-control');
      controlChannelRef.current = controlChannel;
      controlChannel.onmessage = (event) => {
        if (event.data === 'pause') setPaused(true);
        if (event.data === 'play') setPaused(false);
        if (typeof event.data === 'string' && event.data.startsWith('{')) {
          try {
            const packet = JSON.parse(event.data) as {
              framecast?: string;
              currentTime?: number;
              duration?: number;
              paused?: boolean;
              volume?: number;
            };
            if (packet.framecast === 'video-state') {
              setRemoteVideoPosition({
                currentTime: Number.isFinite(packet.currentTime) ? Math.max(0, packet.currentTime ?? 0) : 0,
                duration: Number.isFinite(packet.duration) ? Math.max(0, packet.duration ?? 0) : 0,
                volume: Number.isFinite(packet.volume) ? Math.min(1, Math.max(0, packet.volume ?? 0)) : 0,
              });
              setPaused(Boolean(packet.paused));
            }
          } catch {
            // Ignore other control messages.
          }
        }
      };
      mediaChannel.onopen = () => {
        void (async () => {
          try {
            setStage('sending');
            if (castUrl) {
              mediaChannel.send(JSON.stringify({ framecast: 'remote-video', url: castUrl }));
              return;
            }
            for (let index = 0; index < queue.length; index += 1) {
              if (transferRun !== transferRunRef.current) return;
              const media = queue[index];
              queueIndexRef.current = index;
              setQueueIndex(index);
              setSelectedMedia(media);
              const file = new ExpoFile(media.uri);
              const fileSize = file.size || media.size || 0;
              if (!fileSize) throw new Error(`Could not read “${media.name}”. Choose it again and retry.`);
               const fileLimit = media.kind === 'video' ? MAX_VIDEO_SIZE_BYTES : MAX_TRANSFER_BYTES;
               if (fileSize > fileLimit) {
                 throw new Error(media.kind === 'video' ? 'Videos must be 8 GB or smaller to stream directly.' : 'Photos must be under 256 MB each.');
              }
               const itemId = media.kind === 'image' ? `${Date.now()}-${index}` : undefined;
               if (media.kind === 'image') {
                 const previewDataUrl = await createPhotoPreviewDataUrl(media.uri);
                 if (previewDataUrl && transferRun === transferRunRef.current) {
                   await waitForBuffer(mediaChannel);
                   mediaChannel.send(JSON.stringify({
                     framecast: 'preview',
                     itemId,
                     name: media.name,
                     kind: 'image',
                     previewDataUrl,
                   }));
                 }
               }
              setTotalBytes(fileSize);
              setSentBytes(0);
              const streamCandidate = media.kind === 'video'
                && (media.mimeType === 'video/mp4' || media.mimeType === 'video/quicktime' || /\.(mp4|mov)$/i.test(media.name));
               let remuxedForStreaming = false;
               if (streamCandidate) {
                 setTransferNotice('Preparing this video for direct streaming on your phone…');
                 const remuxResult = await remuxAndSendMp4({
                   file,
                   channel: mediaChannel,
                   name: media.name,
                   originalSize: fileSize,
                   isCancelled: () => transferRun !== transferRunRef.current,
                   waitForBuffer: () => waitForBuffer(mediaChannel),
                   onProgress: setSentBytes,
                 });
                 if (remuxResult === 'cancelled') return;
                 if (remuxResult === 'sent') {
                   remuxedForStreaming = true;
                   setTransferNotice('The phone prepared a streamable copy and is sending it directly to the TV.');
                 } else if (remuxResult === 'unsupported' && fileSize > BUFFERED_VIDEO_FALLBACK_MAX_BYTES) {
                   throw new Error('This large video could not be prepared for instant streaming. Try an MP4 or MOV with its playback index near the start of the file.');
                 }
               }
               if (!remuxedForStreaming) {
                 mediaChannel.send(JSON.stringify({
                   framecast: 'metadata',
                   name: media.name,
                   itemId,
                   mimeType: media.mimeType,
                   kind: media.kind,
                   size: fileSize,
                   streamCandidate,
                 }));
                 for (let offset = 0; offset < fileSize; offset += FILE_CHUNK_SIZE) {
                   if (transferRun !== transferRunRef.current || mediaChannel.readyState !== 'open') return;
                   await waitForBuffer(mediaChannel);
                   const part = await file.slice(offset, Math.min(offset + FILE_CHUNK_SIZE, fileSize)).arrayBuffer();
                   if (transferRun !== transferRunRef.current) return;
                   mediaChannel.send(part);
                   const count = Math.min(offset + part.byteLength, fileSize);
                   setSentBytes(count);
                 }
              }
              let acknowledgement: Promise<string> | undefined;
              if (media.kind === 'image') {
                acknowledgement = new Promise<string>((resolve, reject) => {
                  const timeout = setTimeout(() => {
                    mediaAckResolverRef.current = null;
                    reject(new Error('The TV did not confirm the photo. Check that its screen is awake and try again.'));
                  }, 60_000);
                  mediaAckResolverRef.current = (playback) => {
                    clearTimeout(timeout);
                    resolve(playback);
                  };
                });
              }
               if (!remuxedForStreaming) {
                 await waitForBuffer(mediaChannel);
                 mediaChannel.send(JSON.stringify({ framecast: 'complete' }));
               }
              if (media.kind === 'video') {
                const startDeadline = Date.now() + 20_000;
                while (!videoStreamingRef.current && transferRun === transferRunRef.current && Date.now() < startDeadline) {
                  await new Promise((resolve) => setTimeout(resolve, 150));
                }
                if (transferRun !== transferRunRef.current) return;
          if (!videoStreamingRef.current) {
                    throw new Error('The TV did not start the video. Check its format and keep both devices awake.');
                }
              } else {
                const playback = await acknowledgement;
                if (transferRun !== transferRunRef.current) return;
                if (playback === 'failed') {
                  throw new Error('The TV could not display this photo. Choose it again and retry.');
                }
              }
              setSentQueueCount(index + 1);
              setSentBytes(fileSize);
              if (index < queue.length - 1 && queueRunningRef.current) {
                await new Promise((resolve) => setTimeout(resolve, 1600));
              }
              if (index < queue.length - 1 && !queueRunningRef.current) break;
            }
            if (transferRun !== transferRunRef.current) return;
            if (queueRunningRef.current) {
              queueIndexRef.current = 0;
              setQueueIndex(0);
              setSelectedMedia(queue[0]);
            }
            transferComplete.current = true;
            queueRunningRef.current = false;
            setQueueRunning(false);
            setStage('sent');
          } catch (transferError) {
            if (transferRun !== transferRunRef.current) return;
            queueRunningRef.current = false;
            setQueueRunning(false);
            setStage('paired');
            setError(transferError instanceof Error ? transferError.message : 'The video could not be sent. Try again.');
          }
        })();
      };
      mediaChannel.onclose = () => {
        if (!transferComplete.current && transferRun === transferRunRef.current) {
          queueRunningRef.current = false;
          setQueueRunning(false);
          setStage('paired');
          setError('The direct transfer was interrupted. Keep both devices awake and try again.');
        }
      };
      peer.onicecandidate = (event) => {
        if (event.candidate) sendSignal('ice', event.candidate.toJSON());
      };
      peer.onconnectionstatechange = () => {
        if (transferRun !== transferRunRef.current) return;
        if (peer.connectionState === 'failed') {
          queueRunningRef.current = false;
          setQueueRunning(false);
          setStage('paired');
          setError('A direct connection failed. Your router may block devices from talking to each other. Check that neither device is on guest Wi-Fi or a VPN, and that Wi-Fi client isolation is off. FrameCast does not relay media.');
        } else if (peer.connectionState === 'disconnected') {
          queueRunningRef.current = false;
          setQueueRunning(false);
          setStage('paired');
          setError('The direct connection was interrupted. Reconnect and try again.');
        }
      };
      const offer = await peer.createOffer();
      if (transferRun !== transferRunRef.current) return;
      await peer.setLocalDescription(offer);
      if (transferRun !== transferRunRef.current) return;
      sendSignal('offer', {
        type: offer.type,
        sdp: offer.sdp,
        mediaKind: castUrl ? 'video' : queue[0].kind,
        transport: 'data-channel',
      });
    } catch (transferError) {
      if (transferRun !== transferRunRef.current) return;
      closePeer();
      queueRunningRef.current = false;
      setQueueRunning(false);
      setStage('paired');
      setError(transferError instanceof Error ? transferError.message : 'Could not start the direct transfer.');
    }
  };

  const sendPlaybackControl = (action: string) => {
    const channel = controlChannelRef.current;
    if (channel?.readyState !== 'open') return;
    channel.send(action);
    if (action === 'play' || action === 'pause') setPaused(action === 'pause');
  };

  const showQueuePhoto = (index: number) => {
    if (index < 0 || index >= sentQueueCount) return;
    queueIndexRef.current = index;
    setQueueIndex(index);
    setSelectedMedia(mediaQueueRef.current[index] ?? selectedMedia);
    sendPlaybackControl(`photo:show:${index}`);
  };

  const leaveRoom = () => {
    closePeer(true);
    cleanupTemporaryCopies();
    setIsUrlPlayback(false);
    urlCastActiveRef.current = false;
    setRoomId('');
    setSelectedMedia(null);
    setMediaQueue([]);
    mediaQueueRef.current = [];
    queueRunningRef.current = false;
    setQueueRunning(false);
    setQueueIndex(0);
    setSentQueueCount(0);
    setStage('join');
    setCode('');
    setSentBytes(0);
    setError('');
  };

  const progress = totalBytes ? Math.min(100, Math.round((sentBytes / totalBytes) * 100)) : 0;
  const activeColors = colors;

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: activeColors.background, paddingTop: Platform.OS === 'web' ? Math.max(insets.top, 67) : 0, paddingBottom: Platform.OS === 'web' ? Math.max(insets.bottom, 34) : 0 }]} testID="screen-framecast-mobile">
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <View style={[styles.brandMark, { backgroundColor: activeColors.primary }]}>
            <Ionicons name="tv-outline" size={20} color={activeColors.primaryForeground} />
          </View>
          <Text style={[styles.brand, { color: activeColors.foreground }]}>framecast</Text>
          <View style={styles.privacyChip}>
            <Ionicons name="lock-closed-outline" size={13} color={activeColors.primary} />
            <Text style={[styles.privacyChipText, { color: activeColors.primary }]}>PRIVATE</Text>
          </View>
        </View>

        {stage === 'join' && (
          <View style={styles.main}>
            <Text style={[styles.kicker, { color: activeColors.primary }]}>PHONE COMPANION</Text>
            <Text style={[styles.title, { color: activeColors.foreground }]}>Send it to the big screen.</Text>
            <Text style={[styles.subtitle, { color: activeColors.mutedForeground }]}>Pair with the FrameCast page open on your TV. Share photos or videos from this phone, or paste a video link for the TV to open directly.</Text>

            <View style={[styles.pairCard, { backgroundColor: activeColors.card, borderColor: activeColors.border }]}>
              {scanning ? (
                <View style={[styles.cameraFrame, { backgroundColor: '#101713' }]}>
                  <CameraView
                    style={StyleSheet.absoluteFill}
                    facing="back"
                    barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                    onBarcodeScanned={({ data }) => handleScan(data)}
                    testID="camera-tv-qr-scanner"
                  />
                  <View pointerEvents="none" style={styles.scanOverlay}>
                    <View style={styles.scanCornerTopLeft} />
                    <View style={styles.scanCornerTopRight} />
                    <View style={styles.scanCornerBottomLeft} />
                    <View style={styles.scanCornerBottomRight} />
                  </View>
                  <Pressable style={styles.cameraClose} onPress={() => setScanning(false)} testID="button-close-scanner">
                    <Ionicons name="close" size={22} color="#FFFFFF" />
                  </Pressable>
                  <View style={styles.cameraCaption}>
                    <Text style={styles.cameraCaptionText}>Point your camera at the TV QR code</Text>
                  </View>
                </View>
              ) : (
                <Pressable
                  style={({ pressed }) => [styles.scanButton, { borderColor: activeColors.border, backgroundColor: pressed ? activeColors.secondary : activeColors.background }]}
                  onPress={() => void startScanner()}
                  testID="button-scan-tv-qr"
                >
                  <View style={[styles.actionIcon, { backgroundColor: activeColors.secondary }]}>
                    <Ionicons name="scan-outline" size={23} color={activeColors.primary} />
                  </View>
                  <View style={styles.scanButtonCopy}>
                    <Text style={[styles.buttonTitle, { color: activeColors.foreground }]}>Scan TV code</Text>
                    <Text style={[styles.buttonSubtitle, { color: activeColors.mutedForeground }]}>Use your phone camera</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={activeColors.mutedForeground} />
                </Pressable>
              )}

              <View style={styles.divider}>
                <View style={[styles.dividerLine, { backgroundColor: activeColors.border }]} />
                <Text style={[styles.dividerText, { color: activeColors.mutedForeground }]}>OR ENTER THE CODE</Text>
                <View style={[styles.dividerLine, { backgroundColor: activeColors.border }]} />
              </View>

              <TextInput
                value={code}
                onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, 5))}
                style={[styles.codeInput, { borderColor: activeColors.border, backgroundColor: activeColors.background, color: activeColors.foreground }]}
                placeholder="00000"
                placeholderTextColor={activeColors.mutedForeground}
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                maxLength={5}
                accessibilityLabel="Five-digit TV code"
                testID="input-tv-code"
              />
              <Pressable
                onPress={submitCode}
                disabled={code.length !== 5 || lookupRoom.isPending}
                style={({ pressed }) => [styles.primaryButton, { backgroundColor: activeColors.primary, opacity: code.length !== 5 || lookupRoom.isPending ? 0.5 : pressed ? 0.86 : 1 }]}
                testID="button-join-tv"
              >
                {lookupRoom.isPending ? <ActivityIndicator color={activeColors.primaryForeground} /> : <Ionicons name="link-outline" size={18} color={activeColors.primaryForeground} />}
                <Text style={[styles.primaryButtonText, { color: activeColors.primaryForeground }]}>{lookupRoom.isPending ? 'Connecting…' : 'Connect to TV'}</Text>
              </Pressable>
            </View>
          </View>
        )}

        {(stage === 'paired' || stage === 'connecting' || stage === 'sending' || stage === 'sent') && (
          <View style={styles.main}>
            <View style={[styles.connectedBadge, { backgroundColor: activeColors.secondary }]}>
              <View style={[styles.connectedDot, { backgroundColor: stage === 'paired' ? activeColors.accent : activeColors.primary }]} />
              <Text style={[styles.connectedBadgeText, { color: activeColors.foreground }]}>{stage === 'paired' ? 'TV paired' : stage === 'connecting' ? 'Connecting directly' : stage === 'sending' ? 'Sending to TV' : 'Sent to TV'}</Text>
            </View>
            <Text style={[styles.title, { color: activeColors.foreground }]}>{stage === 'sent' ? mediaQueue.length > 1 ? 'Your photos are on the TV.' : 'It’s on the TV.' : 'Choose what to play.'}</Text>
            <Text style={[styles.subtitle, { color: activeColors.mutedForeground }]}>
              {stage === 'sent'
                ? isUrlPlayback
                  ? 'The TV is playing directly from the video source.'
                  : mediaQueue.length > 1
                    ? sentQueueCount === mediaQueue.length
                      ? `${mediaQueue.length} photos sent in order.`
                      : `${sentQueueCount} of ${mediaQueue.length} photos sent.`
                    : selectedMedia?.kind === 'video' ? transferNotice ? 'The TV started the video after it finished sending.' : 'The TV played the video while it arrived.' : 'The TV starts showing the photo automatically.'
                : selectedMedia?.kind === 'video'
                  ? isUrlPlayback ? 'The TV opens this link directly. The source must allow playback on the TV.' : 'MP4 and MOV videos are prepared on the phone for streaming. Other small videos transfer first; the TV must support their codec.'
                  : 'Your media goes directly to the TV over WebRTC. It is not uploaded to FrameCast.'}
            </Text>

            {selectedMedia ? (
              <View style={[styles.mediaCard, { backgroundColor: activeColors.card, borderColor: activeColors.border }]}>
                <View style={[styles.mediaIcon, { backgroundColor: activeColors.secondary }]}>
                  <Ionicons name={selectedMedia.kind === 'video' ? 'videocam-outline' : 'image-outline'} size={24} color={activeColors.primary} />
                </View>
                <View style={styles.mediaCopy}>
                  <Text numberOfLines={1} style={[styles.mediaName, { color: activeColors.foreground }]}>{selectedMedia.name}</Text>
                  <Text style={[styles.mediaMeta, { color: activeColors.mutedForeground }]}>
                    {mediaQueue.length > 1
                      ? `Photo ${queueIndex + 1} of ${mediaQueue.length} · ${selectedMedia.size ? formatBytes(selectedMedia.size) : 'Photo'}`
                      : selectedMedia.size ? formatBytes(selectedMedia.size) : selectedMedia.kind === 'video' ? 'Video' : 'Photo'}
                  </Text>
                </View>
                <View style={styles.mediaActionGroup}>
                  {selectedMedia.kind === 'image' && stage !== 'sending' && (
                    <Pressable style={styles.mediaAction} onPress={() => void pickPhotos(true)} accessibilityLabel="Add more photos" testID="button-add-more-photos">
                      <Ionicons name="add-circle-outline" size={19} color={activeColors.primary} />
                      <Text style={[styles.mediaActionText, { color: activeColors.primary }]}>Add</Text>
                    </Pressable>
                  )}
                  <Pressable style={styles.mediaAction} onPress={() => void (selectedMedia.kind === 'video' ? pickVideo() : pickPhotos())} accessibilityLabel="Choose different media" testID="button-change-media">
                    <Ionicons name="swap-horizontal-outline" size={19} color={activeColors.mutedForeground} />
                    <Text style={[styles.mediaActionText, { color: activeColors.mutedForeground }]}>Change</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <>
                <Pressable
                  onPress={() => void pickPhotos()}
                  disabled={preparingMedia}
                  style={({ pressed }) => [styles.chooseButton, { backgroundColor: activeColors.card, borderColor: activeColors.border, opacity: pressed ? 0.82 : 1 }]}
                  testID="button-choose-photos"
                >
                  <View style={[styles.actionIcon, { backgroundColor: activeColors.secondary }]}>
                    <Ionicons name="images-outline" size={23} color={activeColors.primary} />
                  </View>
                  <View style={styles.scanButtonCopy}>
                    <Text style={[styles.buttonTitle, { color: activeColors.foreground }]}>{preparingMedia ? 'Preparing media on this phone…' : 'Choose up to 30 photos'}</Text>
                    <Text style={[styles.buttonSubtitle, { color: activeColors.mutedForeground }]}>{preparingMedia ? 'Keeping temporary access so the transfer can finish' : 'Select several in the picker, then send in order'}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={activeColors.mutedForeground} />
                </Pressable>
                <Pressable
                  onPress={() => void pickVideo()}
                  disabled={preparingMedia}
                  style={({ pressed }) => [styles.chooseButton, { backgroundColor: activeColors.card, borderColor: activeColors.border, opacity: pressed ? 0.82 : 1 }]}
                  testID="button-choose-video"
                >
                  <View style={[styles.actionIcon, { backgroundColor: activeColors.secondary }]}>
                    <Ionicons name="videocam-outline" size={23} color={activeColors.primary} />
                  </View>
                  <View style={styles.scanButtonCopy}>
                    <Text style={[styles.buttonTitle, { color: activeColors.foreground }]}>{preparingMedia ? 'Preparing video on this phone…' : 'Choose a video'}</Text>
                    <Text style={[styles.buttonSubtitle, { color: activeColors.mutedForeground }]}>{preparingMedia ? 'Creating a temporary on-device copy' : 'Instant play needs H.264/AAC fragmented MP4'}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={activeColors.mutedForeground} />
                </Pressable>
              </>
            )}
            {stage !== 'connecting' && stage !== 'sending' && (
              <View style={[styles.videoLinkCard, { backgroundColor: activeColors.card, borderColor: activeColors.border }]}>
                <Text style={[styles.buttonTitle, { color: activeColors.foreground }]}>Play a YouTube or video link</Text>
                <TextInput
                  value={videoLink}
                  onChangeText={(value) => {
                    setVideoLink(value);
                    setVideoLinkError('');
                  }}
                  style={[styles.urlInput, { borderColor: activeColors.border, backgroundColor: activeColors.background, color: activeColors.foreground }]}
                  placeholder="https://www.youtube.com/watch?v=..."
                  placeholderTextColor={activeColors.mutedForeground}
                  keyboardType="url"
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="URL"
                  accessibilityLabel="Video or webpage link"
                  testID="input-video-link"
                />
                <Pressable
                  onPress={() => void castVideoLink()}
                  disabled={!videoLink.trim() || checkingVideoLink}
                  style={({ pressed }) => [styles.primaryButton, { backgroundColor: activeColors.primary, opacity: !videoLink.trim() || checkingVideoLink ? 0.5 : pressed ? 0.86 : 1 }]}
                  testID="button-play-video-link"
                >
                  {checkingVideoLink ? <ActivityIndicator color={activeColors.primaryForeground} /> : <Ionicons name="play-outline" size={18} color={activeColors.primaryForeground} />}
                  <Text style={[styles.primaryButtonText, { color: activeColors.primaryForeground }]}>{checkingVideoLink ? 'Checking link…' : 'Play on TV'}</Text>
                </Pressable>
                {videoLinkError ? (
                  <>
                    <Text style={[styles.urlHelp, { color: activeColors.accent }]} accessibilityRole="alert">{videoLinkError}</Text>
                    <Pressable
                      style={[styles.secondaryButton, { backgroundColor: activeColors.secondary }]}
                      onPress={() => void castVideoLinkDirectly()}
                      disabled={!videoLink.trim() || checkingVideoLink}
                      testID="button-try-video-link-direct"
                    >
                      <Text style={[styles.secondaryButtonText, { color: activeColors.foreground }]}>Try this link directly</Text>
                    </Pressable>
                  </>
                ) : null}
                <Text style={[styles.urlHelp, { color: activeColors.mutedForeground }]}>Copy a YouTube link with Share → Copy link and paste it here. The TV opens YouTube’s official player. Some videos block embedding or autoplay; direct MP4/M3U8 links also work.</Text>
              </View>
            )}
            {selectedMedia?.kind === 'image' && stage !== 'sending' && (
              <Text style={[styles.progressCopy, { color: activeColors.mutedForeground }]}>
                {mediaQueue.length > 1
                  ? `${mediaQueue.length} photos queued. You can add more or send them together.`
                  : 'Select several photos in the picker, or tap Add to queue more.'}
              </Text>
            )}

            {(stage === 'sending' || stage === 'sent') && !isUrlPlayback && (selectedMedia?.kind === 'video' || mediaQueue.length > 1) && (
              <View style={[styles.progressTrack, { backgroundColor: activeColors.secondary }]} testID="transfer-progress">
                <View style={[styles.progressFill, { backgroundColor: activeColors.primary, width: `${stage === 'sent' ? 100 : progress}%` }]} />
              </View>
            )}
            {stage === 'sending' && totalBytes ? (
              <Text style={[styles.progressCopy, { color: activeColors.mutedForeground }]}>
                {mediaQueue.length > 1 ? `Photo ${queueIndex + 1} of ${mediaQueue.length} · ` : ''}
                {videoStreaming ? 'The TV is playing while transfer continues · ' : ''}
                {formatBytes(sentBytes)} of {formatBytes(totalBytes)} sent · keep this app open
              </Text>
            ) : null}
            {queueRunning && stage === 'sending' && (
              <Pressable
                onPress={() => { queueRunningRef.current = false; setQueueRunning(false); }}
                style={[styles.secondaryButton, { backgroundColor: activeColors.secondary }]}
                testID="button-stop-photo-queue"
              >
                <Ionicons name="stop-outline" size={18} color={activeColors.foreground} />
                <Text style={[styles.secondaryButtonText, { color: activeColors.foreground }]}>Stop after this photo</Text>
              </Pressable>
            )}

            {(stage === 'sent' || videoStreaming) && selectedMedia?.kind === 'video' && (
              <View style={styles.videoRemoteControls} testID="video-remote-controls">
                <View style={styles.playbackRow}>
                  <Pressable style={[styles.secondaryButton, { backgroundColor: activeColors.secondary }]} onPress={() => sendPlaybackControl('video:seek-by:-10')} accessibilityLabel="Skip back 10 seconds on TV" testID="button-phone-video-back">
                    <Text style={[styles.secondaryButtonText, { color: activeColors.foreground }]}>−10s</Text>
                  </Pressable>
                  <Pressable style={[styles.secondaryButton, { backgroundColor: activeColors.secondary }]} onPress={() => sendPlaybackControl(paused ? 'play' : 'pause')} accessibilityLabel={paused ? 'Play video on TV' : 'Pause video on TV'} testID="button-phone-play-pause">
                    <Ionicons name={paused ? 'play' : 'pause'} size={18} color={activeColors.foreground} />
                    <Text style={[styles.secondaryButtonText, { color: activeColors.foreground }]}>{paused ? 'Play' : 'Pause'}</Text>
                  </Pressable>
                  <Pressable style={[styles.secondaryButton, { backgroundColor: activeColors.secondary }]} onPress={() => sendPlaybackControl('video:seek-by:10')} accessibilityLabel="Skip forward 10 seconds on TV" testID="button-phone-video-forward">
                    <Text style={[styles.secondaryButtonText, { color: activeColors.foreground }]}>+10s</Text>
                  </Pressable>
                </View>
                <Slider
                  minimumValue={0}
                  maximumValue={Math.max(1, remoteVideoPosition.duration)}
                  value={Math.min(Math.max(1, remoteVideoPosition.duration), videoSeekDraft ?? remoteVideoPosition.currentTime)}
                  step={1}
                  disabled={remoteVideoPosition.duration <= 0}
                  minimumTrackTintColor={activeColors.primary}
                  maximumTrackTintColor={activeColors.secondary}
                  thumbTintColor={activeColors.primary}
                  onValueChange={setVideoSeekDraft}
                  onSlidingComplete={(value) => {
                    setVideoSeekDraft(null);
                    sendPlaybackControl(`video:seek:${Math.round(value)}`);
                  }}
                  accessibilityLabel="Seek video on TV"
                  testID="slider-phone-video-seek"
                />
                <View style={styles.videoTimeRow}>
                  <Text style={[styles.progressCopy, { color: activeColors.mutedForeground }]}>
                    {formatPlaybackTime(videoSeekDraft ?? remoteVideoPosition.currentTime)} / {formatPlaybackTime(remoteVideoPosition.duration)}
                  </Text>
                  <View style={styles.playbackRow}>
                    <Pressable style={[styles.secondaryButton, { backgroundColor: activeColors.secondary }]} onPress={() => sendPlaybackControl(`video:volume:${Math.max(0, remoteVideoPosition.volume - 0.1).toFixed(1)}`)} accessibilityLabel="Lower TV volume">
                      <Text style={[styles.secondaryButtonText, { color: activeColors.foreground }]}>Vol−</Text>
                    </Pressable>
                    <Pressable style={[styles.secondaryButton, { backgroundColor: activeColors.secondary }]} onPress={() => sendPlaybackControl(`video:volume:${Math.min(1, remoteVideoPosition.volume + 0.1).toFixed(1)}`)} accessibilityLabel="Raise TV volume">
                      <Text style={[styles.secondaryButtonText, { color: activeColors.foreground }]}>Vol+</Text>
                    </Pressable>
                    <Pressable style={[styles.secondaryButton, { backgroundColor: activeColors.secondary }]} onPress={() => { cleanupTemporaryCopies(); setSelectedMedia(null); setMediaQueue([]); mediaQueueRef.current = []; setStage('paired'); setSentBytes(0); closePeer(true); }} testID="button-stop-tv">
                      <Ionicons name="stop" size={18} color={activeColors.foreground} />
                      <Text style={[styles.secondaryButtonText, { color: activeColors.foreground }]}>Stop</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            )}

            {(stage === 'sending' || stage === 'sent') && selectedMedia?.kind === 'image' && sentQueueCount > 0 && (
              <>
                <Text style={[styles.progressCopy, { color: activeColors.mutedForeground }]}>Browse and zoom the photos on the TV from here.</Text>
                {sentQueueCount > 1 && <View style={styles.playbackRow} testID="photo-remote-navigation">
                  <Pressable
                    style={[styles.secondaryButton, { backgroundColor: activeColors.secondary, opacity: queueIndex === 0 ? 0.45 : 1 }]}
                    onPress={() => showQueuePhoto(queueIndex - 1)}
                    disabled={queueIndex === 0}
                    accessibilityLabel="Previous photo on TV"
                    testID="button-phone-photo-previous"
                  >
                    <Ionicons name="chevron-back" size={18} color={activeColors.foreground} />
                    <Text style={[styles.secondaryButtonText, { color: activeColors.foreground }]}>Back</Text>
                  </Pressable>
                  <Text style={[styles.progressCopy, { color: activeColors.mutedForeground }]}>{queueIndex + 1} / {sentQueueCount}</Text>
                  <Pressable
                    style={[styles.secondaryButton, { backgroundColor: activeColors.secondary, opacity: queueIndex >= sentQueueCount - 1 ? 0.45 : 1 }]}
                    onPress={() => showQueuePhoto(queueIndex + 1)}
                    disabled={queueIndex >= sentQueueCount - 1}
                    accessibilityLabel="Next photo on TV"
                    testID="button-phone-photo-next"
                  >
                    <Text style={[styles.secondaryButtonText, { color: activeColors.foreground }]}>Next</Text>
                    <Ionicons name="chevron-forward" size={18} color={activeColors.foreground} />
                  </Pressable>
                </View>}
                <View style={styles.playbackRow} testID="photo-remote-zoom">
                  <Pressable style={[styles.secondaryButton, { backgroundColor: activeColors.secondary }]} onPress={() => sendPlaybackControl('photo:zoom-out')} accessibilityLabel="Zoom out on TV" testID="button-phone-photo-zoom-out">
                    <Text style={[styles.secondaryButtonText, { color: activeColors.foreground }]}>−</Text>
                  </Pressable>
                  <Pressable style={[styles.secondaryButton, { backgroundColor: activeColors.secondary }]} onPress={() => sendPlaybackControl('photo:zoom-reset')} accessibilityLabel="Reset TV photo zoom" testID="button-phone-photo-zoom-reset">
                    <Text style={[styles.secondaryButtonText, { color: activeColors.foreground }]}>Fit</Text>
                  </Pressable>
                  <Pressable style={[styles.secondaryButton, { backgroundColor: activeColors.secondary }]} onPress={() => sendPlaybackControl('photo:zoom-in')} accessibilityLabel="Zoom in on TV" testID="button-phone-photo-zoom-in">
                    <Text style={[styles.secondaryButtonText, { color: activeColors.foreground }]}>+</Text>
                  </Pressable>
                </View>
              </>
            )}

            {stage !== 'sending' && stage !== 'connecting' && selectedMedia && !isUrlPlayback && (stage !== 'sent' || mediaQueue.length > 1) && (
              <Pressable
                onPress={() => void startTransfer()}
                style={({ pressed }) => [styles.primaryButton, { backgroundColor: activeColors.primary, opacity: pressed ? 0.86 : 1 }]}
                testID="button-send-to-tv"
              >
                <Ionicons name="play" size={18} color={activeColors.primaryForeground} />
                <Text style={[styles.primaryButtonText, { color: activeColors.primaryForeground }]}>
                  {stage === 'sent' && mediaQueue.length > 1 ? `Replay ${mediaQueue.length} photos` : mediaQueue.length > 1 ? `Send ${mediaQueue.length} photos to TV` : 'Send to TV'}
                </Text>
              </Pressable>
            )}

            {(stage === 'sending' || stage === 'connecting') && (
              <View style={styles.loadingRow}>
                <ActivityIndicator color={activeColors.primary} />
                <Text style={[styles.progressCopy, { color: activeColors.mutedForeground }]}>{stage === 'connecting' ? 'Creating a direct connection…' : 'Sending directly to the TV…'}</Text>
              </View>
            )}
            <Pressable onPress={leaveRoom} style={styles.leaveButton} testID="button-leave-room">
              <Text style={[styles.leaveText, { color: activeColors.mutedForeground }]}>Disconnect from this TV</Text>
            </Pressable>
          </View>
        )}

        <View style={[styles.privacyNote, { borderTopColor: activeColors.border }]}>
          <Ionicons name="shield-checkmark-outline" size={18} color={activeColors.primary} />
          <Text style={[styles.privacyText, { color: activeColors.mutedForeground }]}>
            Pairing stays active while in use and expires after 4 hours without activity. Phone files travel directly to the TV and are not stored. For a video link, the TV requests playback from the original site.
          </Text>
        </View>

        {transferNotice ? <Text style={[styles.progressCopy, { color: activeColors.mutedForeground }]}>{transferNotice}</Text> : null}
        {error ? (
          <View style={[styles.errorBox, { backgroundColor: '#FCEBE6' }]} testID="text-error">
            <Ionicons name="alert-circle-outline" size={18} color={activeColors.destructive} />
            <Text style={[styles.errorText, { color: activeColors.destructive }]}>{error}</Text>
          </View>
        ) : null}
        {messagesQuery.isError && roomId ? (
          <Text style={[styles.errorText, { color: activeColors.destructive }]}>Could not reach the TV. Check that its FrameCast page is still open.</Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingHorizontal: 22, paddingBottom: 24 },
  header: { height: 54, flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandMark: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  brand: { fontFamily: 'Inter_700Bold', fontSize: 20, letterSpacing: -0.7 },
  privacyChip: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, backgroundColor: '#E9F0E8' },
  privacyChipText: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 0.9 },
  main: { paddingTop: 36, flexGrow: 1 },
  kicker: { fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 1.4, marginBottom: 10 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 32, lineHeight: 38, letterSpacing: -1.1 },
  subtitle: { fontFamily: 'Inter_400Regular', fontSize: 15, lineHeight: 22, marginTop: 10, marginBottom: 26 },
  pairCard: { borderWidth: 1, borderRadius: 24, padding: 16 },
  videoLinkCard: { borderWidth: 1, borderRadius: 20, padding: 16, marginTop: 18, gap: 9 },
  scanButton: { minHeight: 78, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 17, paddingHorizontal: 13, gap: 12 },
  actionIcon: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  scanButtonCopy: { flex: 1 },
  buttonTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  buttonSubtitle: { fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 4 },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 22, marginBottom: 15 },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { fontFamily: 'Inter_600SemiBold', fontSize: 9, letterSpacing: 1.2 },
  codeInput: { height: 62, borderWidth: 1, borderRadius: 16, fontFamily: 'Inter_700Bold', fontSize: 25, letterSpacing: 8, textAlign: 'center', paddingLeft: 8 },
  urlInput: { minHeight: 50, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, fontFamily: 'Inter_400Regular', fontSize: 14 },
  urlHelp: { fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18 },
  primaryButton: { minHeight: 54, borderRadius: 17, marginTop: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 9, paddingHorizontal: 18 },
  primaryButtonText: { fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  cameraFrame: { height: 275, borderRadius: 18, overflow: 'hidden' },
  scanOverlay: { ...StyleSheet.absoluteFill, margin: 54 },
  scanCornerTopLeft: { position: 'absolute', left: 0, top: 0, width: 30, height: 30, borderLeftWidth: 3, borderTopWidth: 3, borderColor: '#FFFFFF', borderTopLeftRadius: 10 },
  scanCornerTopRight: { position: 'absolute', right: 0, top: 0, width: 30, height: 30, borderRightWidth: 3, borderTopWidth: 3, borderColor: '#FFFFFF', borderTopRightRadius: 10 },
  scanCornerBottomLeft: { position: 'absolute', left: 0, bottom: 0, width: 30, height: 30, borderLeftWidth: 3, borderBottomWidth: 3, borderColor: '#FFFFFF', borderBottomLeftRadius: 10 },
  scanCornerBottomRight: { position: 'absolute', right: 0, bottom: 0, width: 30, height: 30, borderRightWidth: 3, borderBottomWidth: 3, borderColor: '#FFFFFF', borderBottomRightRadius: 10 },
  cameraClose: { position: 'absolute', right: 12, top: 12, width: 38, height: 38, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.45)' },
  cameraCaption: { position: 'absolute', left: 14, right: 14, bottom: 14, padding: 11, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.58)' },
  cameraCaptionText: { color: '#FFFFFF', textAlign: 'center', fontFamily: 'Inter_500Medium', fontSize: 12 },
  connectedBadge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 19 },
  connectedDot: { width: 8, height: 8, borderRadius: 4 },
  connectedBadgeText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  chooseButton: { minHeight: 82, borderWidth: 1, borderRadius: 18, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 12 },
  mediaCard: { minHeight: 78, paddingHorizontal: 13, borderRadius: 17, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  mediaIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  mediaCopy: { flex: 1 },
  mediaName: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  mediaMeta: { fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 4 },
  mediaActionGroup: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  mediaAction: { alignItems: 'center', justifyContent: 'center', minWidth: 38, gap: 2 },
  mediaActionText: { fontFamily: 'Inter_600SemiBold', fontSize: 10 },
  progressTrack: { height: 8, borderRadius: 10, overflow: 'hidden', marginTop: 22 },
  progressFill: { height: '100%', borderRadius: 10 },
  progressCopy: { fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18, marginTop: 9 },
  loadingRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  playbackRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  videoRemoteControls: { gap: 3, marginTop: 8 },
  videoTimeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  secondaryButton: { flex: 1, minHeight: 48, borderRadius: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  secondaryButtonText: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  leaveButton: { alignSelf: 'center', paddingVertical: 18, marginTop: 4 },
  leaveText: { fontFamily: 'Inter_500Medium', fontSize: 13 },
  privacyNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderTopWidth: 1, paddingTop: 17, marginTop: 28 },
  privacyText: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18 },
  errorBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12, borderRadius: 13, marginTop: 14 },
  errorText: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 12, lineHeight: 18 },
});
