import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Alert,
  Keyboard,
  Linking,
  NativeEventEmitter,
  NativeModules,
  Platform,
  PermissionsAndroid,
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
import type { VideoThumbnail } from 'expo-video';
import { Directory, File as ExpoFile, FileMode, Paths } from 'expo-file-system';
import { useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { remuxAndSendMp4 } from '@/lib/mp4-remux';
import { startLocalStream, stopLocalStream } from '@/lib/local-stream';
import {
  BUFFERED_VIDEO_FALLBACK_MAX_BYTES,
  LOCAL_PLAYBACK_FALLBACK_TIMEOUT_MS,
  shouldUseBufferedVideoFallback,
} from '@/lib/local-playback-fallback';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { getYouTubeVideoId } from '@/lib/youtube';
import { findAdjacentVideoIndex } from '@/lib/video-playlist-controls';
import {
  discoverNearbySamsungTvs,
  launchSamsungTvBrowser,
  type NearbySamsungTv,
} from '@/lib/tv-discovery';
import { buildTvRoomUrl } from '@/lib/tv-room-url';
import {
  backgroundCastingAvailable,
  onBackgroundControl,
  onBackgroundStopped,
  startBackgroundCasting,
  stopBackgroundCasting,
  updateBackgroundCasting,
} from '@/lib/background-casting';
import { useColors } from '@/hooks/useColors';
import { CastTabs, type CastTab } from '@/components/CastTabs';
import { MediaPlaylist, type SelectedMedia } from '@/components/MediaPlaylist';
import { AppSettings } from '@/components/AppSettings';
import { VideoBrowser } from '@/components/VideoBrowser';
import { clearFrameCastCache } from '@/lib/local-data-policy';
import { getTemporaryMediaUris, getUnsupportedTvVideoHelp, isUnsupportedTvVideoError } from '@/lib/video-compatibility';
import {
  manageAdPrivacyOptions,
  showBetweenVideoInterstitialAd,
  showPairingInterstitialAd,
  showSelectionRewardedAd,
} from '@/lib/ad-monetization';
import {
  getRemainingMediaSelectionSlots,
  getRemainingPremiumMediaSelectionSlots,
  MAX_MEDIA_SELECTION_ITEMS,
  REWARDED_MEDIA_SELECTION_LIMIT,
} from '@/lib/media-selection';
import { CastingBannerAd } from '@/components/CastingBannerAd';
import { SubscriptionChoiceGate, useSubscriptionChoiceGate } from '@/components/SubscriptionChoiceGate';
import { useSubscription } from '@/lib/revenuecat';
import { shouldAttemptBetweenVideoInterstitial, shouldShowPairingInterstitial } from '@/lib/pairing-ad';
import {
  initializeAppAnalytics,
  setAppAnalyticsConsent,
  trackCastStarted,
  trackPairingCompleted,
} from '@/lib/app-analytics';

const TV_BROWSER_ADDRESS = '2tx1.com';
const CLOUDCONVERT_VIDEO_URL = 'https://cloudconvert.com/video-converter';

import {
  getGetCastRoomMessagesQueryKey,
  useCreateCastRoom,
  useGetCastRoomMessages,
  useLookupCastRoomByCode,
  useSendCastRoomMessage,
  type CastSignalType,
} from '@workspace/api-client-react';

function temporaryUrisForQueue(queue: SelectedMedia[]) {
  return new Set(queue.flatMap(getTemporaryMediaUris));
}

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
  createDataChannel(label: string, options?: { ordered?: boolean; maxRetransmits?: number }): DataChannelLike;
  addTrack(track: ScreenTrackLike, stream: ScreenStreamLike): ScreenSenderLike;
  createOffer(): Promise<{ type: string; sdp?: string }>;
  setLocalDescription(description: { type: string; sdp?: string }): Promise<void>;
  setRemoteDescription(description: { type: string; sdp?: string }): Promise<void>;
  addIceCandidate(candidate: unknown): Promise<void>;
  close(): void;
};

type ScreenTrackLike = {
  enabled: boolean;
  stop(): void;
  getSettings?: () => { width?: number; height?: number; frameRate?: number };
  onended?: (() => void) | null;
};
type ScreenSenderEncoding = {
  active?: boolean;
  maxBitrate?: number;
  maxFramerate?: number;
  scaleResolutionDownBy?: number;
};
type ScreenSenderParameters = {
  encodings?: ScreenSenderEncoding[];
  degradationPreference?: string | null;
};
type ScreenSenderLike = {
  getParameters(): ScreenSenderParameters;
  setParameters(parameters: ScreenSenderParameters): Promise<void>;
};
type ScreenStreamLike = {
  getTracks(): ScreenTrackLike[];
  getVideoTracks(): ScreenTrackLike[];
};

async function configureLowLatencyScreenSender(sender: ScreenSenderLike, track: ScreenTrackLike) {
  const parameters = sender.getParameters();
  const encoding = parameters.encodings?.[0];
  if (!encoding) return;

  const settings = track.getSettings?.();
  const longestSide = Math.max(settings?.width ?? 0, settings?.height ?? 0);
  encoding.maxFramerate = 30;
  encoding.maxBitrate = 3_000_000;
  encoding.scaleResolutionDownBy = longestSide > 1280 ? longestSide / 1280 : 1;
  parameters.degradationPreference = 'maintain-framerate';
  await sender.setParameters(parameters);
}

function decodeBase64AudioFrame(encoded: string): Uint8Array {
  const input = encoded.replace(/[^A-Za-z0-9+/=]/g, '');
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const padding = input.endsWith('==') ? 2 : input.endsWith('=') ? 1 : 0;
  const bytes = new Uint8Array(Math.max(0, Math.floor(input.length * 3 / 4) - padding));
  let output = 0;
  for (let index = 0; index < input.length; index += 4) {
    const a = alphabet.indexOf(input[index] || 'A');
    const b = alphabet.indexOf(input[index + 1] || 'A');
    const c = alphabet.indexOf(input[index + 2] || 'A');
    const d = alphabet.indexOf(input[index + 3] || 'A');
    const bits = (Math.max(0, a) << 18) | (Math.max(0, b) << 12) | (Math.max(0, c) << 6) | Math.max(0, d);
    if (output < bytes.length) bytes[output++] = (bits >> 16) & 0xff;
    if (output < bytes.length) bytes[output++] = (bits >> 8) & 0xff;
    if (output < bytes.length) bytes[output++] = bits & 0xff;
  }
  return bytes;
}

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

function FrameCastHomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { isPremium, loading: subscriptionLoading } = useSubscription();
  const { openPaywall, openFirstPairChoice, firstPairChoicePending } = useSubscriptionChoiceGate();
  const queryClient = useQueryClient();
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const lookupRoom = useLookupCastRoomByCode();
  const createTvRoom = useCreateCastRoom();
  const sendSignalMutation = useSendCastRoomMessage();
  const sendSignalRef = useRef(sendSignalMutation.mutate);
  sendSignalRef.current = sendSignalMutation.mutate;
  const [code, setCode] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scannerStarting, setScannerStarting] = useState(false);
  const [roomId, setRoomId] = useState('');
  const currentRoomRef = useRef(roomId);
  currentRoomRef.current = roomId;
  const [backgroundEnabled, setBackgroundEnabled] = useState(false);
  const [analyticsEnabled, setAnalyticsEnabled] = useState(false);
  const backgroundStartedRoomRef = useRef('');
  const backgroundBlockedByPremiumRef = useRef(false);
  const adOverlayActiveRef = useRef(false);
  const [screenMirrorActive, setScreenMirrorActive] = useState(false);
  const [screenMirrorStarting, setScreenMirrorStarting] = useState(false);
  const [photoSelectionUnlocked, setPhotoSelectionUnlocked] = useState(false);
  const [videoSelectionUnlocked, setVideoSelectionUnlocked] = useState(false);
  const [photoSelectionCount, setPhotoSelectionCount] = useState(0);
  const [videoSelectionCount, setVideoSelectionCount] = useState(0);
  const [rewardedAdLoading, setRewardedAdLoading] = useState(false);
  const screenMirrorStreamRef = useRef<ScreenStreamLike | null>(null);
  const screenAudioChannelRef = useRef<DataChannelLike | null>(null);
  const screenAudioSubscriptionRef = useRef<{ remove(): void } | null>(null);
  const screenAudioAllowedRef = useRef(false);
  const [selectedMedia, setSelectedMedia] = useState<SelectedMedia | null>(null);
  const autoSendAfterSelectionRef = useRef(false);
  const [mediaQueue, setMediaQueue] = useState<SelectedMedia[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const [sentQueueCount, setSentQueueCount] = useState(0);
  const [queueRunning, setQueueRunning] = useState(false);
  const [videoThumbnails, setVideoThumbnails] = useState<Record<string, VideoThumbnail>>({});
  const [videoEnded, setVideoEnded] = useState(false);
  const [error, setError] = useState('');
  const [nearbyTvs, setNearbyTvs] = useState<NearbySamsungTv[]>([]);
  const [tvScanRunning, setTvScanRunning] = useState(false);
  const [tvScanFinished, setTvScanFinished] = useState(false);
  const [connectingTvIp, setConnectingTvIp] = useState('');
  const [nearbyTvMessage, setNearbyTvMessage] = useState('');
  const [transferNotice, setTransferNotice] = useState('');
  const [videoLink, setVideoLink] = useState('');
  const [videoBrowserOpen, setVideoBrowserOpen] = useState(false);
  const [castTab, setCastTab] = useState<CastTab>('url');
  const [videoLinkError, setVideoLinkError] = useState('');
  const [checkingVideoLink, setCheckingVideoLink] = useState(false);
  const [isUrlPlayback, setIsUrlPlayback] = useState(false);
  const [videoStreaming, setVideoStreaming] = useState(false);
  const [localPlayback, setLocalPlayback] = useState(false);
  const [stage, setStage] = useState<'join' | 'paired' | 'connecting' | 'sending' | 'sent'>('join');
  const [pairingAdStatus, setPairingAdStatus] = useState<'idle' | 'loading' | 'unavailable'>('idle');
  const [pairingAdMessage, setPairingAdMessage] = useState('');
  const [betweenVideoAdStatus, setBetweenVideoAdStatus] = useState<'idle' | 'loading'>('idle');
  const [betweenVideoAdMessage, setBetweenVideoAdMessage] = useState('');
  const [sentBytes, setSentBytes] = useState(0);
  const [totalBytes, setTotalBytes] = useState(0);
  const [paused, setPaused] = useState(false);
  const [preparingMedia, setPreparingMedia] = useState(false);
  const [remoteVideoPosition, setRemoteVideoPosition] = useState({ currentTime: 0, duration: 0, volume: 0 });
  const [fullscreenNotice, setFullscreenNotice] = useState('');
  const fullscreenAckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [videoSeekDraft, setVideoSeekDraft] = useState<number | null>(null);
  const transferComplete = useRef(false);
  const peerRef = useRef<PeerLike | null>(null);
  const mediaChannelRef = useRef<DataChannelLike | null>(null);
  const controlChannelRef = useRef<DataChannelLike | null>(null);
  const playlistTransitionAckRef = useRef<(() => void) | null>(null);
  const localSessionRef = useRef<string | null>(null);
  const localOpenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const localFallbackRef = useRef<(() => void) | null>(null);
  const localRuntimeRecoveryRef = useRef<((resumeAt: number) => void) | null>(null);
  const peerRecoveryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mediaQueueRef = useRef<SelectedMedia[]>([]);
  const photoSelectionUnlockRoomRef = useRef('');
  const videoSelectionUnlockRoomRef = useRef('');
  const premiumStateRef = useRef(isPremium);
  premiumStateRef.current = isPremium;
  const subscriptionLoadingRef = useRef(subscriptionLoading);
  subscriptionLoadingRef.current = subscriptionLoading;
  adOverlayActiveRef.current = rewardedAdLoading
    || pairingAdStatus === 'loading'
    || betweenVideoAdStatus === 'loading';
  const photoSelectionCountRef = useRef(0);
  const videoSelectionCountRef = useRef(0);
  const rewardedAdInProgressRef = useRef(false);
  const videoThumbnailRunRef = useRef(0);
  const videoThumbnailUrisRef = useRef(new Set<string>());
  const videoThumbnailInProgressRef = useRef(new Set<string>());
  const autoAdvancedVideoIndexRef = useRef(-1);
  const playQueuedItemRef = useRef<(index: number) => void>(() => {});
  const continueVideoQueueRef = useRef<(completedIndex: number) => void>(() => {});
  const completedVideosSinceInterstitialRef = useRef(0);
  const lastInterstitialAttemptAtRef = useRef<number | null>(null);
  const temporaryMediaUrisRef = useRef(new Set<string>());
  const unsupportedVideoAlertUriRef = useRef('');
  const pairingAdRoomRef = useRef('');
  const analyticsPairingRoomRef = useRef('');
  const stageRef = useRef(stage);
  stageRef.current = stage;
  const pendingMediaPreparationsRef = useRef(new Set<Promise<unknown>>());
  const queueIndexRef = useRef(0);
  const queueRunningRef = useRef(false);
  const transferRunRef = useRef(0);
  const urlCastActiveRef = useRef(false);
  const mediaAckResolverRef = useRef<((playback: string) => void) | null>(null);
  const videoStreamingRef = useRef(false);
  const seenMessages = useRef(new Set<number>());
  const queuedIce = useRef<Record<string, unknown>[]>([]);
  const scanHandled = useRef(false);
  const unsupportedVideoHelpVisible = selectedMedia?.kind === 'video'
    && !isUrlPlayback
    && isUnsupportedTvVideoError(error);

  const clearVideoThumbnailData = () => {
    videoThumbnailRunRef.current += 1;
    videoThumbnailUrisRef.current.clear();
    videoThumbnailInProgressRef.current.clear();
    setVideoThumbnails({});
  };

  function trackMediaPreparation<T>(operation: Promise<T>): Promise<T> {
    pendingMediaPreparationsRef.current.add(operation);
    void operation.then(
      () => pendingMediaPreparationsRef.current.delete(operation),
      () => pendingMediaPreparationsRef.current.delete(operation),
    );
    return operation;
  }

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

  const saveAnalyticsConsent = useCallback(async (enabled: boolean) => {
    await setAppAnalyticsConsent(enabled);
    setAnalyticsEnabled(enabled);
  }, []);

  useEffect(() => {
    let mounted = true;
    void initializeAppAnalytics().then((enabled) => {
      if (mounted) setAnalyticsEnabled(enabled);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const messagesQuery = useGetCastRoomMessages(roomId, {
    query: {
      queryKey: getGetCastRoomMessagesQueryKey(roomId),
      refetchInterval: 700,
      refetchIntervalInBackground: backgroundEnabled,
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
    if (peerRecoveryTimerRef.current) clearTimeout(peerRecoveryTimerRef.current);
    peerRecoveryTimerRef.current = null;
    setLocalPlayback(false);
    localSessionRef.current = null;
    localFallbackRef.current = null;
    localRuntimeRecoveryRef.current = null;
    if (localOpenTimerRef.current) clearTimeout(localOpenTimerRef.current);
    localOpenTimerRef.current = null;
    void stopLocalStream().catch(() => setError('The local video server could not stop cleanly. Close and reopen FrameCast before sharing again.'));
    transferRunRef.current += 1;
    urlCastActiveRef.current = false;
    mediaAckResolverRef.current?.('interrupted');
    mediaAckResolverRef.current = null;
    playlistTransitionAckRef.current?.();
    playlistTransitionAckRef.current = null;
    videoStreamingRef.current = false;
    setVideoStreaming(false);
    setRemoteVideoPosition({ currentTime: 0, duration: 0, volume: 0 });
    setVideoSeekDraft(null);
    if (notifyTv && roomId) sendSignal('close', {});
    transferComplete.current = true;
    mediaChannelRef.current?.close();
    controlChannelRef.current?.close();
    screenAudioSubscriptionRef.current?.remove();
    screenAudioSubscriptionRef.current = null;
    screenAudioChannelRef.current?.close();
    screenAudioChannelRef.current = null;
    void NativeModules.FrameCastBackground?.stopScreenAudioCapture?.().catch(() => undefined);
    mediaChannelRef.current = null;
    controlChannelRef.current = null;
    const screenStream = screenMirrorStreamRef.current;
    screenMirrorStreamRef.current = null;
    screenStream?.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
    setScreenMirrorActive(false);
    setScreenMirrorStarting(false);
    peerRef.current?.close();
    peerRef.current = null;
  }, [roomId, sendSignal]);

  useEffect(() => () => {
    transferRunRef.current += 1;
    if (peerRecoveryTimerRef.current) clearTimeout(peerRecoveryTimerRef.current);
    if (localOpenTimerRef.current) clearTimeout(localOpenTimerRef.current);
    void stopLocalStream().catch(() => undefined);
    void stopBackgroundCasting().catch(() => undefined);
    screenAudioSubscriptionRef.current?.remove();
    void NativeModules.FrameCastBackground?.stopScreenAudioCapture?.().catch(() => undefined);
    mediaChannelRef.current?.close();
    controlChannelRef.current?.close();
    peerRef.current?.close();
    cleanupTemporaryCopies();
  }, [cleanupTemporaryCopies]);

  useEffect(() => {
    if (isPremium) {
      setPairingAdStatus('idle');
      setPairingAdMessage('');
      setBetweenVideoAdStatus('idle');
      setBetweenVideoAdMessage('');
      return;
    }
  }, [isPremium]);

  useEffect(() => {
    if (!roomId) {
      pairingAdRoomRef.current = '';
      analyticsPairingRoomRef.current = '';
      completedVideosSinceInterstitialRef.current = 0;
      lastInterstitialAttemptAtRef.current = null;
      setPairingAdStatus('idle');
      setBetweenVideoAdStatus('idle');
      setBetweenVideoAdMessage('');
      return;
    }
    if (analyticsPairingRoomRef.current !== roomId) {
      analyticsPairingRoomRef.current = roomId;
      void trackPairingCompleted();
    }
    if (!firstPairChoicePending && !subscriptionLoading && !isPremium && Platform.OS !== 'web' && shouldShowPairingInterstitial(roomId, pairingAdRoomRef.current)) {
      pairingAdRoomRef.current = roomId;
      lastInterstitialAttemptAtRef.current = Date.now();
      setPairingAdStatus('loading');
      setPairingAdMessage('');
      void showPairingInterstitialAd(
        () => !premiumStateRef.current
          && !subscriptionLoadingRef.current
          && currentRoomRef.current === roomId
          && stageRef.current === 'paired',
        (message) => {
          if (
            currentRoomRef.current === roomId
            && !premiumStateRef.current
            && !subscriptionLoadingRef.current
          ) setPairingAdMessage(message);
        },
      ).then((result) => {
        if (currentRoomRef.current !== roomId) return;
        if (premiumStateRef.current || subscriptionLoadingRef.current) {
          setPairingAdMessage('');
          setPairingAdStatus('idle');
          return;
        }
        if (result === 'shown') {
          lastInterstitialAttemptAtRef.current = Date.now();
          completedVideosSinceInterstitialRef.current = 0;
        }
        setPairingAdStatus(result === 'unavailable' ? 'unavailable' : 'idle');
      }).catch(() => {
        if (currentRoomRef.current === roomId) {
          if (!premiumStateRef.current && !subscriptionLoadingRef.current) {
            setPairingAdMessage('The ad service failed unexpectedly. Casting can continue.');
            setPairingAdStatus('unavailable');
          } else {
            setPairingAdMessage('');
            setPairingAdStatus('idle');
          }
        }
      });
    }
    seenMessages.current.clear();
    queuedIce.current = [];
    setStage('paired');
    setError('');
    sendSignal('ready', {});
  }, [roomId, sendSignal, firstPairChoicePending, subscriptionLoading, isPremium]);

  useEffect(() => {
    for (const signal of messages) {
      if (signal.from !== 'tv' || seenMessages.current.has(signal.sequence)) continue;
      seenMessages.current.add(signal.sequence);
      if (signal.type === 'player-state' && signal.payload.sessionId === localSessionRef.current) {
        const state = signal.payload;
        if (state.message === 'TV_LOCAL_RECEIVER_UNSUPPORTED') {
          if (localOpenTimerRef.current) clearTimeout(localOpenTimerRef.current);
          localOpenTimerRef.current = null;
          localFallbackRef.current?.();
          continue;
        }
        if (state.message === 'TV_LOCAL_SERVER_UNREACHABLE') {
          if (localOpenTimerRef.current) clearTimeout(localOpenTimerRef.current);
          localOpenTimerRef.current = null;
          if (localRuntimeRecoveryRef.current) {
            localRuntimeRecoveryRef.current(Math.max(0, Number(state.currentTime) || 0));
          } else {
            localFallbackRef.current?.();
          }
          continue;
        }
        if (state.message === 'FULLSCREEN_NEEDS_TV_REMOTE') {
          if (fullscreenAckTimerRef.current) clearTimeout(fullscreenAckTimerRef.current);
          fullscreenAckTimerRef.current = null;
          setFullscreenNotice('This TV browser needs a button press on the TV. Press OK or Full screen on the TV remote.');
        } else if (state.message === 'FULLSCREEN_OK') {
          if (fullscreenAckTimerRef.current) clearTimeout(fullscreenAckTimerRef.current);
          fullscreenAckTimerRef.current = null;
          setFullscreenNotice('Full screen is active on the TV.');
        } else if (state.message === 'FULLSCREEN_EXITED') {
          setFullscreenNotice('Full screen closed on the TV.');
        }
        // Any state from this local session proves the receiver page opened.
        // "opening" means its decoder is preparing, not that navigation failed.
        // Do not kill its HTTP server while the TV is loading the first frames.
        if (localOpenTimerRef.current) clearTimeout(localOpenTimerRef.current);
        localOpenTimerRef.current = null;
        localFallbackRef.current = null;
        setRemoteVideoPosition({
          currentTime: Math.max(0, Number(state.currentTime) || 0),
          duration: Math.max(0, Number(state.duration) || 0),
          volume: Math.min(1, Math.max(0, Number(state.volume) || 0)),
        });
        setPaused(Boolean(state.paused));
        if (state.playback === 'playing' || state.playback === 'ended') {
          transferComplete.current = true;
          videoStreamingRef.current = true;
          setVideoStreaming(true);
          setStage('sent');
          setTransferNotice('Playing directly over Wi-Fi. Keep FrameCast open on this phone.');
          setError('');
          setVideoEnded(state.playback === 'ended');
          if (state.playback === 'ended') {
            const currentIndex = queueIndexRef.current;
            const next = mediaQueueRef.current[currentIndex + 1];
            if (
              mediaQueueRef.current[currentIndex]?.kind === 'video'
              && next?.kind === 'video'
              && autoAdvancedVideoIndexRef.current !== currentIndex
            ) {
              autoAdvancedVideoIndexRef.current = currentIndex;
              continueVideoQueueRef.current(currentIndex);
            }
          }
        } else if (state.playback === 'error' || state.playback === 'blocked') {
          setStage('sent');
          const playbackError = typeof state.message === 'string' && state.message
            ? state.message
            : 'Press Play on the TV remote to start this video.';
          setError(playbackError);
          const failedMedia = mediaQueueRef.current[queueIndexRef.current];
          if (
            failedMedia?.kind === 'video'
            && isUnsupportedTvVideoError(playbackError)
            && unsupportedVideoAlertUriRef.current !== failedMedia.uri
          ) {
            unsupportedVideoAlertUriRef.current = failedMedia.uri;
            Alert.alert(
              'This TV can’t play this video',
              getUnsupportedTvVideoHelp(playbackError),
              [
                { text: 'Not now', style: 'cancel' },
                {
                  text: 'Open CloudConvert',
                  onPress: () => {
                    void Linking.openURL(CLOUDCONVERT_VIDEO_URL).catch(() => {
                      setError(`Could not open CloudConvert. Visit ${CLOUDCONVERT_VIDEO_URL} in your browser.`);
                    });
                  },
                },
              ],
            );
          }
        }
      } else if (signal.type === 'answer') {
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
          clearVideoThumbnailData();
          setVideoEnded(false);
          setRoomId('');
          photoSelectionUnlockRoomRef.current = '';
          videoSelectionUnlockRoomRef.current = '';
          setPhotoSelectionUnlocked(false);
          setVideoSelectionUnlocked(false);
          photoSelectionCountRef.current = 0;
          videoSelectionCountRef.current = 0;
          setPhotoSelectionCount(0);
          setVideoSelectionCount(0);
          setSelectedMedia(null);
          setMediaQueue([]);
          mediaQueueRef.current = [];
          setSentQueueCount(0);
          queueRunningRef.current = false;
          setQueueRunning(false);
          setStage('join');
          setCastTab('url');
          setError('The TV started a new room. Scan its new code to reconnect.');
        } else {
          setStage('paired');
          setError('The TV ended this connection.');
        }
      }
    }
  }, [messages, closePeer, cleanupTemporaryCopies]);

  useEffect(() => {
    if (!localPlayback) return;
    let cancelled = false;
    void activateKeepAwakeAsync('framecast-stream').then(() => {
      if (cancelled) deactivateKeepAwake('framecast-stream');
    }).catch(() => setError('Keep your phone screen awake while this video is playing.'));
    return () => {
      cancelled = true;
      deactivateKeepAwake('framecast-stream');
    };
  }, [localPlayback]);

  const joinRoom = (id: string) => {
    if (!id) {
      setError('That QR code does not contain a FrameCast room. Scan the code shown on the TV.');
      return;
    }
    closePeer(Boolean(peerRef.current));
    cleanupTemporaryCopies();
    clearVideoThumbnailData();
    setVideoEnded(false);
    setIsUrlPlayback(false);
    urlCastActiveRef.current = false;
    setRoomId(id);
    photoSelectionUnlockRoomRef.current = '';
    videoSelectionUnlockRoomRef.current = '';
    setPhotoSelectionUnlocked(false);
    setVideoSelectionUnlocked(false);
    photoSelectionCountRef.current = 0;
    videoSelectionCountRef.current = 0;
    setPhotoSelectionCount(0);
    setVideoSelectionCount(0);
    setCastTab('url');
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
    openFirstPairChoice();
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
    if (scannerStarting || scanning) return;
    setError('');
    setScannerStarting(true);
    try {
      const permission = cameraPermission?.granted
        ? cameraPermission
        : await requestCameraPermission();
      if (!permission.granted) {
        if (!permission.canAskAgain && Platform.OS !== 'web') {
          Alert.alert(
            'Camera permission is off',
            'Allow camera access in Settings to scan the TV code. You can still enter the five-digit code.',
            [
              { text: 'Not now', style: 'cancel' },
              {
                text: 'Open settings',
                onPress: () => {
                  void Linking.openSettings().catch(() => {
                    setError('Could not open device settings. You can still enter the five-digit code.');
                  });
                },
              },
            ],
          );
        }
        setError(permission.canAskAgain
          ? 'Camera access is needed to scan the TV code. Allow it when your phone asks, or enter the five-digit code.'
          : 'Camera access is turned off for FrameCast. Enable it in device Settings, or enter the five-digit code.');
        return;
      }
      scanHandled.current = false;
      setScanning(true);
    } catch (scannerError) {
      const reason = scannerError instanceof Error ? scannerError.message : '';
      setError(reason
        ? `The camera could not be opened: ${reason}. You can still enter the five-digit code.`
        : 'The camera could not be opened. You can still enter the five-digit code.');
    } finally {
      setScannerStarting(false);
    }
  };

  const scanForNearbyTvs = async () => {
    if (Platform.OS !== 'android' || tvScanRunning || connectingTvIp) return;
    setError('');
    setNearbyTvMessage('');
    setNearbyTvs([]);
    setTvScanRunning(true);
    setTvScanFinished(false);
    try {
      const devices = await discoverNearbySamsungTvs();
      setNearbyTvs(devices);
      setTvScanFinished(true);
      if (!devices.length) {
        setError('No Samsung TVs found. Put the phone and TV on the same Wi-Fi, then scan again.');
      }
    } catch (scanError) {
      setError(scanError instanceof Error
        ? scanError.message
        : 'Could not scan for TVs. Check that Wi-Fi is on and try again.');
    } finally {
      setTvScanRunning(false);
    }
  };

  const connectToNearbyTv = async (tv: NearbySamsungTv) => {
    if (connectingTvIp) return;
    setError('');
    setNearbyTvMessage(`Trying to open FrameCast on ${tv.name}. Approve FrameCast on the TV if it asks.`);
    setConnectingTvIp(tv.ip);
    try {
      const room = await createTvRoom.mutateAsync();
      let browserLaunchFailed = false;
      try {
        await launchSamsungTvBrowser(tv.ip, buildTvRoomUrl(room));
      } catch {
        browserLaunchFailed = true;
      }

      const manualPairingInstructions =
        `On the TV, open its Internet browser and type ${TV_BROWSER_ADDRESS}. When FrameCast appears, scan the TV's QR code or enter its five-digit code on this phone.`;

      if (browserLaunchFailed) {
        setNearbyTvMessage(`${tv.name} was found. Use the TV browser address and QR/code instructions.`);
        Alert.alert(
          'TV browser did not open automatically',
          `${tv.name} was found, but FrameCast could not open its browser. ${manualPairingInstructions}`,
          [{ text: 'Use QR or code' }],
        );
        return;
      }

      setNearbyTvMessage(`Opening request sent to ${tv.name}. Check the TV, then choose how to continue.`);
      Alert.alert(
        `Finish connecting to ${tv.name}`,
        `I asked the TV to open FrameCast. If it did not open, ${manualPairingInstructions}`,
        [
          {
            text: 'Use QR or code instead',
            style: 'cancel',
            onPress: () => setNearbyTvMessage(manualPairingInstructions),
          },
          {
            text: 'Continue',
            onPress: () => joinRoom(room.id),
          },
        ],
      );
    } catch {
      setNearbyTvMessage('');
      setError(`Could not start pairing with ${tv.name}. Check your internet connection and try again.`);
    } finally {
      setConnectingTvIp('');
    }
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

  const selectMedia = (queue: SelectedMedia[], initialIndex = 0) => {
    if (!queue.length) return;
    cleanupTemporaryCopies(temporaryUrisForQueue(queue));
    const safeIndex = Math.min(Math.max(0, initialIndex), queue.length - 1);
    clearVideoThumbnailData();
    autoAdvancedVideoIndexRef.current = -1;
    setVideoEnded(false);
    setIsUrlPlayback(false);
    urlCastActiveRef.current = false;
    setVideoLinkError('');
    queueRunningRef.current = false;
    setQueueRunning(false);
    closePeer(true);
    mediaQueueRef.current = queue;
    queueIndexRef.current = safeIndex;
    setMediaQueue(queue);
    setQueueIndex(safeIndex);
    setSentQueueCount(0);
    setSelectedMedia(queue[safeIndex]);
    setStage('paired');
    setSentBytes(0);
    setTotalBytes(0);
    setError('');
    unsupportedVideoAlertUriRef.current = '';
    autoSendAfterSelectionRef.current = true;
  };

  const showRewardedAdForRoom = async (roomAtPrompt: string) => {
    if (premiumStateRef.current) return 'earned' as const;
    if (subscriptionLoadingRef.current) return 'unavailable' as const;
    if (rewardedAdInProgressRef.current) return 'unavailable' as const;
    rewardedAdInProgressRef.current = true;
    setRewardedAdLoading(true);
    try {
      return await showSelectionRewardedAd(
        () => !premiumStateRef.current
          && !subscriptionLoadingRef.current
          && currentRoomRef.current === roomAtPrompt
          && AppState.currentState === 'active',
        (message) => {
          if (
            currentRoomRef.current === roomAtPrompt
            && !premiumStateRef.current
            && !subscriptionLoadingRef.current
          ) setError(message);
        },
      );
    } finally {
      rewardedAdInProgressRef.current = false;
      setRewardedAdLoading(false);
    }
  };

  const prepareVideoThumbnails = async (queue: SelectedMedia[], generation: number) => {
    if (Platform.OS === 'web') return;
    try {
      const { createVideoPlayer } = await import('expo-video');
      for (const media of queue) {
        if (generation !== videoThumbnailRunRef.current) return;
        if (
          media.kind !== 'video'
          || videoThumbnailUrisRef.current.has(media.uri)
          || videoThumbnailInProgressRef.current.has(media.uri)
        ) continue;
        videoThumbnailInProgressRef.current.add(media.uri);
        let player: ReturnType<typeof createVideoPlayer> | undefined;
        try {
          player = createVideoPlayer(media.uri);
          const [thumbnail] = await player.generateThumbnailsAsync(0.5);
          if (thumbnail && generation === videoThumbnailRunRef.current) {
            videoThumbnailUrisRef.current.add(media.uri);
            setVideoThumbnails((current) => ({ ...current, [media.uri]: thumbnail }));
          }
        } catch {
          // Keep the video poster tile if the local file cannot produce a preview frame.
        } finally {
          player?.release();
          videoThumbnailInProgressRef.current.delete(media.uri);
        }
      }
    } catch {
      // Thumbnails are optional; video selection and direct playback remain available.
    }
  };

  const showPremiumRequiredForMedia = (kind: 'image' | 'video') => {
    const label = kind === 'image' ? 'photos' : 'videos';
    Alert.alert(
      'Get FrameCast Premium',
      `You have used the free and ad-unlocked ${kind === 'image' ? 'photo' : 'video'}. Buy Premium to choose more ${label}.`,
      [
        { text: 'Not now', style: 'cancel' },
        { text: 'Buy Premium', onPress: () => openPaywall() },
      ],
    );
  };

  const pickPhotos = async (append = false) => {
    setError('');
    const unlocked = photoSelectionUnlockRoomRef.current === currentRoomRef.current;
    const existingPhotos = append ? mediaQueueRef.current.filter((media) => media.kind === 'image') : [];
    const canAppend = append && existingPhotos.length === mediaQueueRef.current.length;
    const existingCount = canAppend ? existingPhotos.length : 0;
    const selectedThisSession = photoSelectionCountRef.current;
    const remainingSessionSlots = isPremium
      ? getRemainingPremiumMediaSelectionSlots(selectedThisSession)
      : getRemainingMediaSelectionSlots(unlocked, selectedThisSession);
    const selectionLimit = Math.min(remainingSessionSlots, MAX_MEDIA_SELECTION_ITEMS - existingCount);
    if (selectionLimit < 1) {
      if (isPremium) setError(`You can choose up to ${MAX_MEDIA_SELECTION_ITEMS} photos in this TV session.`);
      else if (unlocked) showPremiumRequiredForMedia('image');
      else void requestMoreMedia('image');
      return;
    }
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        allowsMultipleSelection: true,
        selectionLimit,
        quality: 0.85,
      });
      if (result.canceled || !result.assets?.length) return;
      if (result.assets.length > selectionLimit) {
        setError(`Choose up to ${selectionLimit} more photo${selectionLimit === 1 ? '' : 's'}.`);
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
      photoSelectionCountRef.current += pickedPhotos.length;
      setPhotoSelectionCount(photoSelectionCountRef.current);
      if (canAppend && existingPhotos.length) {
        const queue = [...existingPhotos, ...pickedPhotos];
        mediaQueueRef.current = queue;
        setMediaQueue(queue);
      } else {
        selectMedia(pickedPhotos);
      }
    } catch (mediaError) {
      cleanupTemporaryCopies(temporaryUrisForQueue(mediaQueueRef.current));
      setError(mediaError instanceof Error ? mediaError.message : 'Could not read the selected photos. Choose them again and retry.');
    } finally {
      setPreparingMedia(false);
    }
  };

  const pickVideo = async (append = false) => {
    setError('');
    const unlocked = videoSelectionUnlockRoomRef.current === currentRoomRef.current;
    const existingVideos = append ? mediaQueueRef.current.filter((media) => media.kind === 'video') : [];
    const canAppend = append && existingVideos.length === mediaQueueRef.current.length;
    const existingCount = canAppend ? existingVideos.length : 0;
    const selectedThisSession = videoSelectionCountRef.current;
    const remainingSessionSlots = isPremium
      ? getRemainingPremiumMediaSelectionSlots(selectedThisSession)
      : getRemainingMediaSelectionSlots(unlocked, selectedThisSession);
    const remainingSlots = Math.min(remainingSessionSlots, MAX_MEDIA_SELECTION_ITEMS - existingCount);
    if (remainingSlots < 1) {
      if (isPremium) setError(`You can choose up to ${MAX_MEDIA_SELECTION_ITEMS} videos in this TV session.`);
      else if (unlocked) showPremiumRequiredForMedia('video');
      else void requestMoreMedia('video');
      return;
    }
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['videos'],
        allowsEditing: false,
        allowsMultipleSelection: true,
        selectionLimit: remainingSlots,
        quality: 1,
      });
      if (result.canceled || !result.assets?.length) return;
      if (result.assets.length > remainingSlots) {
        setError(`Choose up to ${remainingSlots} more video${remainingSlots === 1 ? '' : 's'}.`);
        return;
      }
      setPreparingMedia(true);
      const pickedVideos: SelectedMedia[] = [];
      for (const [index, asset] of result.assets.entries()) {
        const name = asset.fileName || `Video ${existingVideos.length + index + 1}`;
        const cached = await makePickerAssetReadable(asset.uri, name);
        if (cached.temporaryCopy) temporaryMediaUrisRef.current.add(cached.uri);
        pickedVideos.push({
          uri: cached.uri,
          name,
          mimeType: asset.mimeType || 'video/mp4',
          kind: 'video',
          size: cached.size ?? asset.fileSize ?? undefined,
          duration: asset.duration ?? undefined,
          temporaryCopy: cached.temporaryCopy,
        });
      }
      videoSelectionCountRef.current += pickedVideos.length;
      setVideoSelectionCount(videoSelectionCountRef.current);
      const queue = [...existingVideos, ...pickedVideos];
      if (canAppend && existingVideos.length) {
        mediaQueueRef.current = queue;
        setMediaQueue(queue);
        const generation = ++videoThumbnailRunRef.current;
        void prepareVideoThumbnails(pickedVideos.slice(0, 1), generation);
      } else {
        selectMedia(queue);
        void prepareVideoThumbnails(queue.slice(0, 1), videoThumbnailRunRef.current);
      }
    } catch (mediaError) {
      cleanupTemporaryCopies(temporaryUrisForQueue(mediaQueueRef.current));
      setError(mediaError instanceof Error ? mediaError.message : 'Could not read the selected video. Choose it again and retry.');
    } finally {
      setPreparingMedia(false);
    }
  };

  const requestMoreMedia = (kind: 'image' | 'video') => {
    if (rewardedAdLoading || preparingMedia) return;
    const roomAtPrompt = currentRoomRef.current;
    if (!roomAtPrompt) {
      setError('Connect to the TV before adding more media.');
      return;
    }
    const unlockedRoom = kind === 'image'
      ? photoSelectionUnlockRoomRef.current
      : videoSelectionUnlockRoomRef.current;
    const selectedThisSession = kind === 'image' ? photoSelectionCountRef.current : videoSelectionCountRef.current;
    if (isPremium) {
      if (getRemainingPremiumMediaSelectionSlots(selectedThisSession) < 1) {
        setError(`You can choose up to ${MAX_MEDIA_SELECTION_ITEMS} ${kind === 'image' ? 'photos' : 'videos'} in this TV session.`);
        return;
      }
      if (kind === 'image') void pickPhotos(true);
      else void pickVideo(true);
      return;
    }
    if (unlockedRoom === roomAtPrompt) {
      if (getRemainingMediaSelectionSlots(true, selectedThisSession) < 1) {
        showPremiumRequiredForMedia(kind);
      } else if (kind === 'image') {
        void pickPhotos(true);
      } else {
        void pickVideo(true);
      }
      return;
    }

    if (getRemainingMediaSelectionSlots(false, selectedThisSession) > 0) {
      if (kind === 'image') void pickPhotos(true);
      else void pickVideo(true);
      return;
    }
    if (selectedThisSession >= REWARDED_MEDIA_SELECTION_LIMIT) {
      showPremiumRequiredForMedia(kind);
      return;
    }

    const singular = kind === 'image' ? 'photo' : 'video';
    const mediaLabel = kind === 'image' ? 'photos' : 'videos';
    Alert.alert(
      `Add one more ${singular}`,
      `One ${singular} is free. Watch a rewarded ad to choose one more ${singular}. After that, Premium is needed for more ${mediaLabel}. This reward applies only to ${mediaLabel}.`,
      [
        { text: 'Not now', style: 'cancel' },
        {
          text: 'Watch ad',
          onPress: () => {
            void (async () => {
              const result = await showRewardedAdForRoom(roomAtPrompt);
              if (result === 'earned') {
                const activeRoom = currentRoomRef.current;
                if (!activeRoom) {
                  setError('The TV connection ended before the selection could be unlocked.');
                  return;
                }
                if (kind === 'image') {
                  photoSelectionUnlockRoomRef.current = activeRoom;
                  setPhotoSelectionUnlocked(true);
                  await pickPhotos(true);
                } else {
                  videoSelectionUnlockRoomRef.current = activeRoom;
                  setVideoSelectionUnlocked(true);
                  await pickVideo(true);
                }
              } else if (result === 'cancelled' && currentRoomRef.current) {
                setError(`The ad was not completed. Your selected ${singular} is still available.`);
              }
            })();
          },
        },
        { text: 'Buy Premium', onPress: () => openPaywall() },
      ],
    );
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

  const startTransfer = async (
    remoteUrl?: string,
    screenStream?: ScreenStreamLike,
    requestedQueueIndex?: number,
    forceCompatibilityTransfer = false,
  ) => {
    if (fullscreenAckTimerRef.current) clearTimeout(fullscreenAckTimerRef.current);
    fullscreenAckTimerRef.current = null;
    setFullscreenNotice('');
    const castUrl = remoteUrl ? normalizeVideoLink(remoteUrl) : null;
    const allMedia = castUrl || screenStream ? [] : mediaQueueRef.current.length ? mediaQueueRef.current : selectedMedia ? [selectedMedia] : [];
    const selectedQueueIndex = allMedia.length
      ? Math.min(Math.max(0, requestedQueueIndex ?? queueIndexRef.current), allMedia.length - 1)
      : 0;
    const isVideoPlaylist = allMedia.length > 1 && allMedia.every((media) => media.kind === 'video');
    const sendOneMedia = requestedQueueIndex !== undefined || isVideoPlaylist;
    const queueIndexOffset = sendOneMedia ? selectedQueueIndex : 0;
    const queue = castUrl || screenStream
      ? []
      : sendOneMedia
        ? [allMedia[selectedQueueIndex]]
        : allMedia;
    if (!roomId || (!castUrl && !screenStream && !queue.length)) {
      setError('Choose photos or a video first.');
      return;
    }
    if (!forceCompatibilityTransfer) {
      const castMode = screenStream
        ? 'screen_mirror'
        : castUrl
          ? 'url'
          : queue[0]?.kind === 'image'
            ? 'images'
            : 'video';
      void trackCastStarted(castMode);
    }
    if (castUrl) {
      cleanupTemporaryCopies();
      const hostname = new URL(castUrl).hostname;
      setSelectedMedia({ uri: castUrl, name: hostname || 'Video link', mimeType: 'video/url', kind: 'video' });
      setMediaQueue([]);
      mediaQueueRef.current = [];
      setIsUrlPlayback(true);
      setVideoThumbnails({});
    } else {
      setIsUrlPlayback(false);
    }
    if (queue.length) {
      queueIndexRef.current = queueIndexOffset;
      setQueueIndex(queueIndexOffset);
      setSelectedMedia(queue[0]);
    }
    setVideoEnded(false);
    setError('');
    unsupportedVideoAlertUriRef.current = '';
    setVideoLinkError('');
    setStage('connecting');
    setSentBytes(0);
    setTotalBytes(0);
    queueRunningRef.current = !castUrl && queue.length > 1 && queue[0].kind === 'image';
    setQueueRunning(queueRunningRef.current);
    if (requestedQueueIndex === undefined) setSentQueueCount(0);
    videoStreamingRef.current = false;
    setVideoStreaming(false);
    setPaused(true);
    setRemoteVideoPosition({ currentTime: 0, duration: 0, volume: 0 });
    closePeer();
    urlCastActiveRef.current = Boolean(castUrl);
    const transferRun = transferRunRef.current;
    queuedIce.current = [];
    try {
      // Native phone -> TV HTTP byte ranges. The TV starts from a small buffer,
      // can seek anywhere, and does not wait for a complete WebRTC file copy.
      if (!forceCompatibilityTransfer && !castUrl && queue.length === 1 && queue[0].kind === 'video' && Platform.OS !== 'web') {
        const media = queue[0];
        setTransferNotice('Opening the video directly over your Wi-Fi…');
        const stream = await trackMediaPreparation(startLocalStream(media.uri, media.name));
        if (transferRun !== transferRunRef.current) {
          await stopLocalStream();
          return;
        }
        localSessionRef.current = stream.sessionId;
        setLocalPlayback(true);
        setStage('sending');
        sendSignal('local-video', {
          sessionId: stream.sessionId,
          receiverUrl: stream.receiverUrl,
          extension: stream.extension,
        });
        setSentQueueCount((count) => Math.max(count, queueIndexOffset + 1));
        let recoveryAttempts = 0;
        function fallbackToCompatibility(expectedSessionId: string) {
          if (localSessionRef.current !== expectedSessionId) return;
          if (localOpenTimerRef.current) clearTimeout(localOpenTimerRef.current);
          localOpenTimerRef.current = null;
          localFallbackRef.current = null;
          localRuntimeRecoveryRef.current = null;
          const fileSize = media.size || new ExpoFile(media.uri).size || 0;
          if (shouldUseBufferedVideoFallback(fileSize)) {
            setTransferNotice('The phone video link stopped responding. Reconnecting through FrameCast…');
            void startTransfer(undefined, undefined, requestedQueueIndex, true);
            return;
          }
          closePeer(true);
          setStage('paired');
          setError('The phone video link stopped responding. The TV has returned to FrameCast. Reconnect and try again.');
        }
        function recoverLocalPlayback(expectedSessionId: string, resumeAt: number) {
          if (localSessionRef.current !== expectedSessionId) return;
          if (recoveryAttempts >= 1) {
            fallbackToCompatibility(expectedSessionId);
            return;
          }
          recoveryAttempts += 1;
          setTransferNotice('Reconnecting to your video over Wi-Fi…');
          void trackMediaPreparation(startLocalStream(media.uri, media.name)).then((refreshed) => {
            if (transferRun !== transferRunRef.current || localSessionRef.current !== expectedSessionId) return;
            localSessionRef.current = refreshed.sessionId;
            localRuntimeRecoveryRef.current = (position) => recoverLocalPlayback(refreshed.sessionId, position);
            localFallbackRef.current = () => fallbackToCompatibility(refreshed.sessionId);
            sendSignal('local-video', {
              sessionId: refreshed.sessionId,
              receiverUrl: refreshed.receiverUrl,
              extension: refreshed.extension,
              resumeAt: Math.max(0, Number(resumeAt) || 0),
            });
            if (localOpenTimerRef.current) clearTimeout(localOpenTimerRef.current);
            localOpenTimerRef.current = setTimeout(() => {
              localOpenTimerRef.current = null;
              localFallbackRef.current?.();
            }, LOCAL_PLAYBACK_FALLBACK_TIMEOUT_MS);
          }).catch(() => fallbackToCompatibility(expectedSessionId));
        }
        localRuntimeRecoveryRef.current = (resumeAt) => recoverLocalPlayback(stream.sessionId, resumeAt);
        localFallbackRef.current = () => fallbackToCompatibility(stream.sessionId);
        localOpenTimerRef.current = setTimeout(
          () => fallbackToCompatibility(stream.sessionId),
          LOCAL_PLAYBACK_FALLBACK_TIMEOUT_MS,
        );
        return;
      }
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
      setTransferNotice(forceCompatibilityTransfer
        ? 'Direct TV playback did not start. Sending this video through the compatibility transfer…'
        : '');
      transferComplete.current = false;

      const peer = createPeerConnection();
      peerRef.current = peer;
      if (screenStream) {
        screenMirrorStreamRef.current = screenStream;
        for (const track of screenStream.getVideoTracks()) {
          track.onended = () => {
            if (screenMirrorStreamRef.current !== screenStream) return;
            closePeer(true);
            setStage('paired');
            setTransferNotice('');
          };
          const sender = peer.addTrack(track, screenStream);
          try {
            await configureLowLatencyScreenSender(sender, track);
          } catch (error) {
            console.warn('Low-latency screen sender tuning unavailable; continuing with WebRTC defaults.', error);
          }
        }
        transferComplete.current = true;
        setScreenMirrorActive(true);
      }
      let connectedOnce = false;
      const holdInterruptedConnection = () => {
        if (peerRecoveryTimerRef.current) return;
        peerRecoveryTimerRef.current = setTimeout(() => {
          peerRecoveryTimerRef.current = null;
          if (transferRun !== transferRunRef.current || peerRef.current !== peer || (peer.connectionState === 'connected' && mediaChannelRef.current?.readyState === 'open')) return;
          queueRunningRef.current = false;
          setQueueRunning(false);
          setStage('paired');
          setError('The connection did not recover within one minute. Return to FrameCast and try again; the TV room is kept.');
        }, 60_000);
      };
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
      if (screenStream) {
        const audioChannel = peer.createDataChannel('framecast-screen-audio', {
          ordered: false,
          maxRetransmits: 0,
        });
        screenAudioChannelRef.current = audioChannel;
        audioChannel.onopen = () => {
          if (!screenAudioAllowedRef.current) {
            setTransferNotice('Screen mirroring is active without sound. Allow playback-audio access to mirror supported app audio.');
            return;
          }
          const nativeAudio = NativeModules.FrameCastBackground;
          if (!nativeAudio?.startScreenAudioCapture) {
            setTransferNotice('Screen mirroring is active, but this Android build does not include playback-audio capture.');
            return;
          }
          screenAudioSubscriptionRef.current?.remove();
          const emitter = new NativeEventEmitter(nativeAudio);
          screenAudioSubscriptionRef.current = emitter.addListener('framecast-screen-audio', (encoded: unknown) => {
            if (typeof encoded !== 'string' || audioChannel.readyState !== 'open' || audioChannel.bufferedAmount > 16_000) return;
            try {
              audioChannel.send(decodeBase64AudioFrame(encoded));
            } catch {
              // Audio is best-effort; video mirroring stays active if a packet cannot be sent.
            }
          });
          void nativeAudio.startScreenAudioCapture().then(
            () => setTransferNotice('Mirroring your screen and supported app audio directly to the TV. Some apps block audio capture.'),
            () => {
              screenAudioSubscriptionRef.current?.remove();
              screenAudioSubscriptionRef.current = null;
              setTransferNotice('Screen mirroring is active without sound. This app may block audio capture.');
            },
          );
        };
      }
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
              ended?: boolean;
              volume?: number;
              fullscreen?: boolean;
              needsGesture?: boolean;
            };
            if (packet.framecast === 'playlist-next-loading-ack') {
              playlistTransitionAckRef.current?.();
              return;
            }
            if (packet.framecast === 'fullscreen-state') {
              if (fullscreenAckTimerRef.current) clearTimeout(fullscreenAckTimerRef.current);
              fullscreenAckTimerRef.current = null;
              setFullscreenNotice(packet.fullscreen
                ? 'Full screen is active on the TV.'
                : packet.needsGesture
                  ? 'This TV browser needs a button press on the TV. Press OK or Full screen on the TV remote.'
                  : 'The TV did not enter full screen. Try the TV remote.');
            }
            if (packet.framecast === 'video-state') {
              setRemoteVideoPosition({
                currentTime: Number.isFinite(packet.currentTime) ? Math.max(0, packet.currentTime ?? 0) : 0,
                duration: Number.isFinite(packet.duration) ? Math.max(0, packet.duration ?? 0) : 0,
                volume: Number.isFinite(packet.volume) ? Math.min(1, Math.max(0, packet.volume ?? 0)) : 0,
              });
              setPaused(Boolean(packet.paused));
              setVideoEnded(Boolean(packet.ended));
              if (packet.ended) {
                const currentIndex = queueIndexRef.current;
                const next = mediaQueueRef.current[currentIndex + 1];
                if (
                  mediaQueueRef.current[currentIndex]?.kind === 'video'
                  && next?.kind === 'video'
                  && autoAdvancedVideoIndexRef.current !== currentIndex
                ) {
                  autoAdvancedVideoIndexRef.current = currentIndex;
                  continueVideoQueueRef.current(currentIndex);
                }
              }
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
              const currentQueueIndex = queueIndexOffset + index;
              queueIndexRef.current = currentQueueIndex;
              setQueueIndex(currentQueueIndex);
              setSelectedMedia(media);
              const transferName = media.name;
              const transferMimeType = media.mimeType;
              const file = new ExpoFile(media.uri);
              const fileSize = file.size || media.size || 0;
              if (!fileSize) throw new Error(`Could not read “${transferName}”. Choose it again and retry.`);
               const fileLimit = media.kind === 'video' ? MAX_VIDEO_SIZE_BYTES : MAX_TRANSFER_BYTES;
               if (fileSize > fileLimit) {
                 throw new Error(media.kind === 'video' ? 'Videos must be 8 GB or smaller to stream directly.' : 'Photos must be under 256 MB each.');
              }
                const itemId = media.kind === 'image' ? `${Date.now()}-${currentQueueIndex}` : undefined;
               if (media.kind === 'image') {
                 const previewDataUrl = await trackMediaPreparation(createPhotoPreviewDataUrl(media.uri));
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
                && (transferMimeType === 'video/mp4' || transferMimeType === 'video/quicktime' || /\.(mp4|mov)$/i.test(transferName));
               let remuxedForStreaming = false;
               if (streamCandidate) {
                 setTransferNotice('Preparing this video for direct streaming on your phone…');
                 const remuxResult = await remuxAndSendMp4({
                    file: {
                      size: fileSize,
                      slice: (start, end) => file.slice(start, end),
                      ...(Platform.OS === 'web' ? {} : { open: () => file.open(FileMode.ReadOnly) }),
                    },
                   channel: mediaChannel,
                    name: transferName,
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
                    name: transferName,
                   itemId,
                    mimeType: transferMimeType,
                   kind: media.kind,
                   size: fileSize,
                   streamCandidate,
                 }));
                  const fileHandle = Platform.OS === 'web' ? null : file.open(FileMode.ReadOnly);
                  try {
                    for (let offset = 0; offset < fileSize; offset += FILE_CHUNK_SIZE) {
                      if (transferRun !== transferRunRef.current || mediaChannel.readyState !== 'open') return;
                      await waitForBuffer(mediaChannel);
                      const length = Math.min(FILE_CHUNK_SIZE, fileSize - offset);
                      const part = fileHandle
                        ? fileHandle.readBytes(length)
                        : await file.slice(offset, offset + length).arrayBuffer();
                      if (transferRun !== transferRunRef.current) return;
                      if (part.byteLength !== length) throw new Error(`Could not read all of “${media.name}”. Choose it again and retry.`);
                      mediaChannel.send(part);
                      setSentBytes(offset + part.byteLength);
                    }
                  } finally {
                    fileHandle?.close();
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
                if (requestedQueueIndex !== undefined) sendPlaybackControl(`photo:show:${currentQueueIndex}`);
              }
              setSentQueueCount((count) => Math.max(count, currentQueueIndex + 1));
              setSentBytes(fileSize);
              if (index < queue.length - 1 && queueRunningRef.current) {
                await new Promise((resolve) => setTimeout(resolve, 1600));
              }
              if (index < queue.length - 1 && !queueRunningRef.current) break;
            }
            if (transferRun !== transferRunRef.current) return;
            if (queueRunningRef.current) {
              const currentQueueIndex = Math.min(queueIndexRef.current, queue.length - 1);
              queueIndexRef.current = currentQueueIndex;
              setQueueIndex(currentQueueIndex);
              setSelectedMedia(queue[currentQueueIndex]);
            }
            transferComplete.current = true;
            queueRunningRef.current = false;
            setQueueRunning(false);
            setStage('sent');
          } catch (transferError) {
            if (transferRun !== transferRunRef.current) return;
            if (connectedOnce && (peer.connectionState === 'disconnected' || peer.connectionState === 'failed' || mediaChannel.readyState === 'closed')) {
              holdInterruptedConnection();
              return;
            }
            queueRunningRef.current = false;
            setQueueRunning(false);
            setStage('paired');
            setError(transferError instanceof Error ? transferError.message : screenStream ? 'The TV could not receive the mirrored screen. Try again.' : 'The video could not be sent. Try again.');
          }
        })();
      };
      mediaChannel.onclose = () => {
        if (!transferComplete.current && transferRun === transferRunRef.current) {
          if (connectedOnce) {
            holdInterruptedConnection();
            return;
          }
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
        if (peer.connectionState === 'connected') {
          connectedOnce = true;
          if (screenMirrorStreamRef.current === screenStream) {
            setStage('sent');
            setTransferNotice('Your phone screen is mirrored to the TV. Use Stop mirroring when finished.');
          }
          if (peerRecoveryTimerRef.current) setError('');
          if (peerRecoveryTimerRef.current) clearTimeout(peerRecoveryTimerRef.current);
          peerRecoveryTimerRef.current = null;
          return;
        }
        if (connectedOnce && (peer.connectionState === 'disconnected' || peer.connectionState === 'failed')) {
          holdInterruptedConnection();
          return;
        }
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
        mediaKind: castUrl || screenStream ? 'video' : queue[0].kind,
        transport: screenStream ? 'track' : 'data-channel',
        ...(screenStream ? { mediaSource: 'screen' } : {}),
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

  useEffect(() => {
    if (!autoSendAfterSelectionRef.current || !roomId || preparingMedia || !selectedMedia) return;
    autoSendAfterSelectionRef.current = false;
    void startTransfer();
  }, [roomId, preparingMedia, selectedMedia]);

  const sendPlaybackControl = (action: string) => {
    if (action === 'video:fullscreen') {
      if (fullscreenAckTimerRef.current) clearTimeout(fullscreenAckTimerRef.current);
      setFullscreenNotice('Requesting full screen on the TV…');
      fullscreenAckTimerRef.current = setTimeout(() => {
        fullscreenAckTimerRef.current = null;
        setFullscreenNotice((current) => current === 'Requesting full screen on the TV…'
          ? 'If the TV did not switch, press OK or Full screen on the TV remote. Some TV browsers require a local button press.'
          : current);
      }, 3000);
    }
    if (localSessionRef.current) {
      sendSignal('player-command', { sessionId: localSessionRef.current, action });
      if (action === 'play' || action === 'pause') setPaused(action === 'pause');
      return;
    }
    const channel = controlChannelRef.current;
    if (channel?.readyState !== 'open') {
      if (action === 'video:fullscreen') {
        if (fullscreenAckTimerRef.current) clearTimeout(fullscreenAckTimerRef.current);
        fullscreenAckTimerRef.current = null;
        setFullscreenNotice('TV controls are reconnecting. Try again once connected.');
      }
      return;
    }
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

  const playQueuedItem = (index: number) => {
    const item = mediaQueueRef.current[index];
    if (!item || preparingMedia) return;
    if (item.kind === 'image' && stage === 'sending' && index >= sentQueueCount) return;

    queueIndexRef.current = index;
    setQueueIndex(index);
    setSelectedMedia(item);
    setVideoEnded(false);
    autoAdvancedVideoIndexRef.current = -1;
    if (item.kind === 'video' && !videoThumbnailUrisRef.current.has(item.uri)) {
      void prepareVideoThumbnails([item], videoThumbnailRunRef.current);
    }
    if (item.kind === 'image' && index < sentQueueCount) {
      showQueuePhoto(index);
      return;
    }
    autoSendAfterSelectionRef.current = false;
    void startTransfer(undefined, undefined, index);
  };
  playQueuedItemRef.current = playQueuedItem;

  const requestTvPlaylistTransition = async () => {
    const channel = controlChannelRef.current;
    if (channel?.readyState !== 'open') return;

    await new Promise<void>((resolve) => {
      let settled = false;
      let timeout: ReturnType<typeof setTimeout> | null = null;
      const finish = () => {
        if (settled) return;
        settled = true;
        if (timeout) clearTimeout(timeout);
        if (playlistTransitionAckRef.current === finish) playlistTransitionAckRef.current = null;
        resolve();
      };
      playlistTransitionAckRef.current = finish;
      timeout = setTimeout(finish, 1200);
      try {
        channel.send(JSON.stringify({ framecast: 'playlist-next-loading' }));
      } catch {
        finish();
      }
    });
  };

  const continueVideoQueue = async (completedIndex: number) => {
    const completedItem = mediaQueueRef.current[completedIndex];
    const nextItem = mediaQueueRef.current[completedIndex + 1];
    if (completedItem?.kind !== 'video' || nextItem?.kind !== 'video') return;

    completedVideosSinceInterstitialRef.current += 1;
    const roomAtVideoEnd = currentRoomRef.current;
    await requestTvPlaylistTransition();
    if (currentRoomRef.current !== roomAtVideoEnd || queueIndexRef.current !== completedIndex) return;

    const now = Date.now();
    const shouldShowBreakAd = !isPremium
      && !subscriptionLoading
      && Platform.OS === 'android'
      && AppState.currentState === 'active'
      && shouldAttemptBetweenVideoInterstitial(
        completedVideosSinceInterstitialRef.current,
        lastInterstitialAttemptAtRef.current,
        now,
      );

    if (shouldShowBreakAd) {
      lastInterstitialAttemptAtRef.current = now;
      setBetweenVideoAdStatus('loading');
      setBetweenVideoAdMessage('');
      const result = await showBetweenVideoInterstitialAd(
        () => !premiumStateRef.current
          && !subscriptionLoadingRef.current
          && currentRoomRef.current === roomAtVideoEnd
          && stageRef.current === 'sent'
          && queueIndexRef.current === completedIndex
          && AppState.currentState === 'active',
        (message) => {
          if (
            currentRoomRef.current === roomAtVideoEnd
            && !premiumStateRef.current
            && !subscriptionLoadingRef.current
          ) setBetweenVideoAdMessage(message);
        },
      );
      if (currentRoomRef.current !== roomAtVideoEnd) return;
      if (premiumStateRef.current || subscriptionLoadingRef.current) {
        setBetweenVideoAdMessage('');
        setBetweenVideoAdStatus('idle');
      } else {
        if (result === 'shown') {
          lastInterstitialAttemptAtRef.current = Date.now();
          completedVideosSinceInterstitialRef.current = 0;
        }
        setBetweenVideoAdStatus('idle');
      }
    }

    if (currentRoomRef.current !== roomAtVideoEnd || queueIndexRef.current !== completedIndex) return;
    playQueuedItemRef.current(completedIndex + 1);
  };
  continueVideoQueueRef.current = (completedIndex) => { void continueVideoQueue(completedIndex); };

  const leaveRoom = () => {
    if (fullscreenAckTimerRef.current) clearTimeout(fullscreenAckTimerRef.current);
    fullscreenAckTimerRef.current = null;
    setFullscreenNotice('');
    autoSendAfterSelectionRef.current = false;
    currentRoomRef.current = '';
    setBackgroundEnabled(false);
    void stopBackgroundCasting().catch(() => setError('Android could not stop background casting. Close FrameCast to end its service.'));
    closePeer(true);
    cleanupTemporaryCopies();
    setIsUrlPlayback(false);
    urlCastActiveRef.current = false;
    setRoomId('');
    photoSelectionUnlockRoomRef.current = '';
    videoSelectionUnlockRoomRef.current = '';
    setPhotoSelectionUnlocked(false);
    setVideoSelectionUnlocked(false);
    photoSelectionCountRef.current = 0;
    videoSelectionCountRef.current = 0;
    setPhotoSelectionCount(0);
    setVideoSelectionCount(0);
    setSelectedMedia(null);
    setMediaQueue([]);
    mediaQueueRef.current = [];
    queueRunningRef.current = false;
    setQueueRunning(false);
    setQueueIndex(0);
    setSentQueueCount(0);
    setStage('join');
    setCastTab('url');
    setCode('');
    setSentBytes(0);
    setError('');
  };

  const openAdPrivacyOptions = async () => {
    try {
      const opened = await manageAdPrivacyOptions();
      Alert.alert(
        'Advertising privacy',
        opened
          ? 'Your Google advertising privacy choices have been updated.'
          : 'No additional advertising privacy choices are currently required for your region.',
      );
    } catch {
      Alert.alert('Advertising privacy', 'The privacy choices form could not be opened. Check your connection and try again.');
    }
  };

  const clearLocalData = async () => {
    if (preparingMedia || checkingVideoLink) {
      throw new Error('Finish preparing media or checking the link before clearing local data.');
    }
    const previousRoom = roomId;
    leaveRoom();
    setVideoLink('');
    setVideoLinkError('');
    setTransferNotice('');
    setTotalBytes(0);
    setScanning(false);
    scanHandled.current = true;
    lookupRoom.reset();
    if (previousRoom) {
      const queryKey = getGetCastRoomMessagesQueryKey(previousRoom);
      await queryClient.cancelQueries({ queryKey });
      queryClient.removeQueries({ queryKey });
    }
    // A native thumbnail/server operation can finish after Disconnect. Wait
    // before sweeping its cache so it cannot recreate files after success.
    if (pendingMediaPreparationsRef.current.size) {
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          Promise.allSettled([...pendingMediaPreparationsRef.current]),
          new Promise<never>((_, reject) => {
            timeout = setTimeout(() => reject(new Error('Media is still preparing. Close and reopen FrameCast, then try clearing local data again.')), 30_000);
          }),
        ]);
      } finally {
        if (timeout !== undefined) clearTimeout(timeout);
      }
    }
    const services = await Promise.allSettled([stopBackgroundCasting(), stopLocalStream()]);
    if (services.some(result => result.status === 'rejected')) {
      throw new Error('A casting service could not stop. Close and reopen FrameCast, then try clearing local data again.');
    }
    if (Platform.OS !== 'web') {
      const cache = new Directory(Paths.cache);
      clearFrameCastCache(cache.uri, cache.list().map(entry => ({
        name: entry.name,
        uri: entry.uri,
        directory: entry instanceof Directory,
        delete: () => entry.delete(),
      })));
    }
  };

  const backgroundControlRef = useRef<(action: string) => void>(() => undefined);
  backgroundControlRef.current = action => {
    if (action === 'disconnect') leaveRoom();
    else if (action === 'playlist:previous' || action === 'playlist:next') {
      const direction = action === 'playlist:next' ? 1 : -1;
      const index = findAdjacentVideoIndex(mediaQueueRef.current, queueIndexRef.current, direction);
      if (index !== null) playQueuedItemRef.current(index);
    } else {
      sendPlaybackControl(action);
    }
  };

  useEffect(() => onBackgroundControl(action => backgroundControlRef.current(action)), []);
  useEffect(() => onBackgroundStopped(() => setBackgroundEnabled(false)), []);
  useEffect(() => {
    if (!roomId) {
      backgroundStartedRoomRef.current = '';
      setBackgroundEnabled(false);
      void stopBackgroundCasting().catch(() => undefined);
      return;
    }

    if (!backgroundCastingAvailable) return;
    if (subscriptionLoading) return;

    if (!isPremium) {
      backgroundStartedRoomRef.current = '';
      setBackgroundEnabled(false);
      void stopBackgroundCasting().catch(() => undefined);
      return;
    }

    if (backgroundStartedRoomRef.current === roomId) return;

    const startingRoom = roomId;
    backgroundStartedRoomRef.current = startingRoom;
    setBackgroundEnabled(false);
    void startBackgroundCasting({
      title: 'Connected to your TV',
      paused: false,
      position: 0,
      duration: 0,
    }).then(async () => {
      if (currentRoomRef.current !== startingRoom) {
        await stopBackgroundCasting();
        return;
      }
      setBackgroundEnabled(true);
    }).catch(reason => {
      backgroundStartedRoomRef.current = '';
      if (currentRoomRef.current === startingRoom) {
        setError(reason instanceof Error ? reason.message : 'Background casting could not start. Allow notifications to keep the TV connected.');
      }
    });
  }, [roomId, isPremium, subscriptionLoading]);
  useEffect(() => {
    if (backgroundEnabled && roomId) {
      updateBackgroundCasting({
        title: selectedMedia?.name ?? 'Connected to your TV',
        paused,
        position: remoteVideoPosition.currentTime,
        duration: remoteVideoPosition.duration,
      });
    }
  }, [backgroundEnabled, roomId, selectedMedia?.name, paused, remoteVideoPosition.currentTime, remoteVideoPosition.duration]);

  const stopFreeCastingForBackground = useCallback(() => {
    const roomAtBackground = currentRoomRef.current;
    const casting = ['connecting', 'sending', 'sent'].includes(stageRef.current);
    if (
      premiumStateRef.current
      || !roomAtBackground
      || !casting
      || adOverlayActiveRef.current
    ) return;

    backgroundBlockedByPremiumRef.current = true;
    closePeer(true);
    setIsUrlPlayback(false);
    setPaused(false);
    setVideoEnded(false);
    setQueueRunning(false);
    queueRunningRef.current = false;
    setBackgroundEnabled(false);
    setStage('paired');
    setError('Free casting stops when FrameCast is in the background.');
    void stopBackgroundCasting().catch(() => undefined);
  }, [closePeer]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const onAppStateChange = (nextState: string) => {
      if (nextState === 'background') {
        stopFreeCastingForBackground();
      } else if (nextState === 'active' && backgroundBlockedByPremiumRef.current) {
        backgroundBlockedByPremiumRef.current = false;
        if (premiumStateRef.current) return;
        Alert.alert(
          'Keep casting while you use other apps',
          'Free casting stops when FrameCast is in the background. Premium keeps your TV connected while you use other apps.',
          [
            { text: 'Not now', style: 'cancel' },
            { text: 'View Premium', onPress: openPaywall },
          ],
        );
      }
    };
    const subscription = AppState.addEventListener('change', onAppStateChange);
    return () => subscription.remove();
  }, [openPaywall, stopFreeCastingForBackground]);

  useEffect(() => {
    if (
      Platform.OS !== 'web'
      && AppState.currentState === 'background'
      && !adOverlayActiveRef.current
    ) {
      stopFreeCastingForBackground();
    }
  }, [betweenVideoAdStatus, isPremium, pairingAdStatus, rewardedAdLoading, stage, stopFreeCastingForBackground]);

  const startScreenMirror = async () => {
    if (Platform.OS !== 'android' || !roomId) {
      setError('Connect to the TV before starting screen mirroring.');
      return;
    }
    if (screenMirrorStarting || screenMirrorActive) return;
    setScreenMirrorStarting(true);
    setError('');
    let stream: ScreenStreamLike | null = null;
    try {
      const nativeWebRTC = require('react-native-webrtc') as {
        mediaDevices: { getDisplayMedia(): Promise<ScreenStreamLike> };
      };
      screenAudioAllowedRef.current = false;
      if (Platform.Version >= 29) {
        const audioPermission = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, {
          title: 'Allow playback audio for screen mirroring?',
          message: 'FrameCast sends supported app playback audio directly to your TV. It does not record microphone audio.',
          buttonPositive: 'Allow',
          buttonNegative: 'Continue without sound',
        });
        screenAudioAllowedRef.current = audioPermission === PermissionsAndroid.RESULTS.GRANTED;
      }
      stream = await nativeWebRTC.mediaDevices.getDisplayMedia();
      if (!stream.getVideoTracks().length) throw new Error('Android did not provide a screen video track.');
      if (!currentRoomRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      await startTransfer(undefined, stream);
      if (screenMirrorStreamRef.current !== stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    } catch (reason) {
      if (stream && screenMirrorStreamRef.current !== stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      const message = reason instanceof Error ? reason.message : String(reason);
      setError(message === 'NotAllowedError'
        ? 'Screen sharing was cancelled. Tap Start screen mirroring to try again.'
        : message || 'Could not start screen mirroring. Keep FrameCast open and try again.');
    } finally {
      setScreenMirrorStarting(false);
    }
  };

  const requestScreenMirror = () => {
    if (Platform.OS !== 'android') {
      void startScreenMirror();
      return;
    }
    if (!currentRoomRef.current) {
      setError('Connect to the TV before starting screen mirroring.');
      return;
    }
    if (screenMirrorStarting || screenMirrorActive) return;
    if (!isPremium) {
      Alert.alert(
        'Screen mirroring needs Premium',
        'Mirroring another app requires FrameCast to run in the background. Free casting stops when FrameCast is not open.',
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'View Premium', onPress: openPaywall },
        ],
      );
      return;
    }
    void startScreenMirror();
  };

  const stopScreenMirror = () => {
    screenAudioAllowedRef.current = false;
    closePeer(true);
    setStage(roomId ? 'paired' : 'join');
    setTransferNotice('');
    setError('');
  };

  const progress = totalBytes ? Math.min(100, Math.round((sentBytes / totalBytes) * 100)) : 0;
  const activeColors = colors;
  const mediaSelectionTitle = (kind: 'image' | 'video') => {
    const noun = kind === 'image' ? 'photo' : 'video';
    const plural = kind === 'image' ? 'photos' : 'videos';
    const count = kind === 'image' ? photoSelectionCount : videoSelectionCount;
    const rewardAvailable = kind === 'image' ? photoSelectionUnlocked : videoSelectionUnlocked;
    if (preparingMedia) return 'Preparing media on this phone…';
    if (rewardedAdLoading) return 'Loading rewarded ad…';
    if (isPremium) return `Choose up to ${MAX_MEDIA_SELECTION_ITEMS} ${plural}`;
    if (count >= REWARDED_MEDIA_SELECTION_LIMIT) return `Get Premium for more ${plural}`;
    if (count === 1 && rewardAvailable) return `Choose one more ${noun}`;
    if (count === 1) return `Add one more ${noun}`;
    return `Choose one ${noun} free`;
  };
  const mediaSelectionSubtitle = (kind: 'image' | 'video') => {
    const plural = kind === 'image' ? 'photos' : 'videos';
    const count = kind === 'image' ? photoSelectionCount : videoSelectionCount;
    const rewardAvailable = kind === 'image' ? photoSelectionUnlocked : videoSelectionUnlocked;
    if (preparingMedia) return 'Keeping temporary access so the transfer can finish';
    if (isPremium) return `Premium lets you choose up to ${MAX_MEDIA_SELECTION_ITEMS} ${plural} per TV session`;
    if (count >= REWARDED_MEDIA_SELECTION_LIMIT) return 'Buy Premium to choose more';
    if (count === 1 && rewardAvailable) return 'Your one ad-unlocked selection is ready';
    return 'One is free; watch an ad for one more. Premium unlocks more.';
  };

  if (videoBrowserOpen && Platform.OS === 'android') {
    return (
      <VideoBrowser
        initialUrl={videoLink}
        onClose={() => setVideoBrowserOpen(false)}
        onPlayVideo={(url) => {
          setVideoLink(url);
          setVideoBrowserOpen(false);
          void startTransfer(url);
        }}
      />
    );
  }

  return (
    <>
    <SafeAreaView style={[styles.safeArea, { backgroundColor: activeColors.background, paddingTop: Platform.OS === 'web' ? Math.max(insets.top, 67) : 0, paddingBottom: Platform.OS === 'web' ? Math.max(insets.bottom, 34) : 0 }]} testID="screen-framecast-mobile">
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <View style={[styles.brandMark, { backgroundColor: activeColors.primary }]}>
            <Ionicons name="tv-outline" size={20} color={activeColors.primaryForeground} />
          </View>
          <Text style={[styles.brand, { color: activeColors.foreground }]}>framecast</Text>
          <View style={[styles.privacyChip, { backgroundColor: activeColors.secondary }]}>
            <Ionicons name="lock-closed-outline" size={13} color={activeColors.primary} />
            <Text style={[styles.privacyChipText, { color: activeColors.primary }]}>PRIVATE</Text>
          </View>
          <AppSettings
            onClearLocalData={clearLocalData}
            onManageAdPrivacy={openAdPrivacyOptions}
            analyticsEnabled={analyticsEnabled}
            onAnalyticsChange={saveAnalyticsConsent}
            clearDisabled={preparingMedia || checkingVideoLink}
            showBackgroundCasting={backgroundCastingAvailable}
            premiumActive={isPremium}
            onOpenPremium={openPaywall}
            onManagePremium={() => {
              void Linking.openURL('https://play.google.com/store/account/subscriptions?package=com.tvcast.com');
            }}
          />
        </View>

        {stage !== 'join' && <CastTabs value={castTab} onChange={setCastTab} />}

        {stage === 'join' && (
          <View style={styles.main}>
            <Text style={[styles.title, { color: activeColors.foreground }]}>Connect to your TV</Text>
            <Text style={[styles.subtitle, { color: activeColors.mutedForeground }]}>Open FrameCast in the TV browser, then scan its QR code or enter the five-digit code.</Text>

            <View style={[styles.tvAddressHint, { backgroundColor: activeColors.secondary, borderColor: activeColors.border }]} testID="tv-pairing-instructions">
              <Text style={[styles.tvAddressLabel, { color: activeColors.mutedForeground }]}>TV browser address</Text>
              <Text
                style={[styles.tvAddress, { color: activeColors.primary }]}
                selectable
                accessibilityRole="text"
                accessibilityLabel={`FrameCast TV website address: ${TV_BROWSER_ADDRESS}. Press and hold to copy.`}
                testID="tv-browser-address"
              >{TV_BROWSER_ADDRESS}</Text>
            </View>

            <View style={[styles.pairCard, { backgroundColor: activeColors.card, borderColor: activeColors.border }]}>
              {Platform.OS === 'android' && (
                <View style={styles.tvDiscoverySection}>
                  <Pressable
                    style={({ pressed }) => [styles.scanButton, { borderColor: activeColors.border, backgroundColor: pressed ? activeColors.secondary : activeColors.background }]}
                    onPress={() => void scanForNearbyTvs()}
                    disabled={tvScanRunning || Boolean(connectingTvIp)}
                    testID="button-find-nearby-tvs"
                  >
                    <View style={[styles.actionIcon, { backgroundColor: activeColors.secondary }]}>
                      {tvScanRunning
                        ? <ActivityIndicator color={activeColors.primary} />
                        : <Ionicons name="wifi-outline" size={22} color={activeColors.primary} />}
                    </View>
                    <View style={styles.scanButtonCopy}>
                      <Text style={[styles.buttonTitle, { color: activeColors.foreground }]}>
                        {tvScanRunning ? 'Scanning for Samsung TVs…' : 'Find TVs on Wi-Fi'}
                      </Text>
                      <Text style={[styles.buttonSubtitle, { color: activeColors.mutedForeground }]}>
                        Phone and TV must use the same Wi-Fi
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={activeColors.mutedForeground} />
                  </Pressable>
                  {tvScanFinished && nearbyTvs.length === 0 && (
                    <Text style={[styles.buttonSubtitle, { color: activeColors.mutedForeground }]} testID="text-no-nearby-tvs">
                      No TVs found. You can still use QR pairing below.
                    </Text>
                  )}
                  {nearbyTvs.map((tv) => (
                    <Pressable
                      key={tv.ip}
                      style={({ pressed }) => [styles.scanButton, { borderColor: activeColors.border, backgroundColor: pressed ? activeColors.secondary : activeColors.background }]}
                      onPress={() => void connectToNearbyTv(tv)}
                      disabled={Boolean(connectingTvIp)}
                      testID={`button-connect-tv-${tv.ip}`}
                    >
                      <View style={[styles.actionIcon, { backgroundColor: activeColors.secondary }]}>
                        {connectingTvIp === tv.ip
                          ? <ActivityIndicator color={activeColors.primary} />
                          : <Ionicons name="tv-outline" size={22} color={activeColors.primary} />}
                      </View>
                      <View style={styles.scanButtonCopy}>
                        <Text style={[styles.buttonTitle, { color: activeColors.foreground }]}>{tv.name}</Text>
                        <Text style={[styles.buttonSubtitle, { color: activeColors.mutedForeground }]}>{tv.ip}{tv.model !== 'Samsung Smart TV' ? ` · ${tv.model}` : ''}</Text>
                      </View>
                      <Text style={[styles.buttonSubtitle, { color: activeColors.primary }]}>
                        {connectingTvIp === tv.ip ? 'Opening…' : 'Connect'}
                      </Text>
                    </Pressable>
                  ))}
                  {nearbyTvMessage ? (
                    <Text style={[styles.buttonSubtitle, { color: activeColors.mutedForeground }]} accessibilityLiveRegion="polite">
                      {nearbyTvMessage}
                    </Text>
                  ) : null}
                </View>
              )}

              {scanning ? (
                <View style={[styles.cameraFrame, { backgroundColor: activeColors.primary }]}>
                  <CameraView
                    style={StyleSheet.absoluteFill}
                    facing="back"
                    barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                    onBarcodeScanned={({ data }) => handleScan(data)}
                    onMountError={({ message }) => {
                      setScanning(false);
                      setError(message
                        ? `The camera could not start: ${message}. You can still enter the five-digit code.`
                        : 'The camera could not start. You can still enter the five-digit code.');
                    }}
                    testID="camera-tv-qr-scanner"
                  />
                  <View pointerEvents="none" style={styles.scanOverlay}>
                    <View style={styles.scanCornerTopLeft} />
                    <View style={styles.scanCornerTopRight} />
                    <View style={styles.scanCornerBottomLeft} />
                    <View style={styles.scanCornerBottomRight} />
                  </View>
                  <Pressable style={styles.cameraClose} onPress={() => setScanning(false)} testID="button-close-scanner">
                    <Ionicons name="close" size={22} color={activeColors.primaryForeground} />
                  </Pressable>
                  <View style={styles.cameraCaption}>
                    <Text style={styles.cameraCaptionText}>Point your camera at the TV QR code</Text>
                  </View>
                </View>
              ) : (
                <Pressable
                  style={({ pressed }) => [styles.scanButton, { borderColor: activeColors.border, backgroundColor: pressed ? activeColors.secondary : activeColors.background }]}
                  onPress={() => void startScanner()}
                  disabled={scannerStarting}
                  testID="button-scan-tv-qr"
                >
                  <View style={[styles.actionIcon, { backgroundColor: activeColors.secondary }]}>
                    {scannerStarting
                      ? <ActivityIndicator color={activeColors.primary} />
                      : <Ionicons name="scan-outline" size={23} color={activeColors.primary} />}
                  </View>
                  <View style={styles.scanButtonCopy}>
                    <Text style={[styles.buttonTitle, { color: activeColors.foreground }]}>{scannerStarting ? 'Opening camera…' : 'Scan TV code'}</Text>
                    <Text style={[styles.buttonSubtitle, { color: activeColors.mutedForeground }]}>{scannerStarting ? 'Allow camera access when asked' : 'Use your phone camera'}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={activeColors.mutedForeground} />
                </Pressable>
              )}

              <View style={styles.divider}>
                <View style={[styles.dividerLine, { backgroundColor: activeColors.border }]} />
                <Text style={[styles.dividerText, { color: activeColors.mutedForeground }]}>OR ENTER THE 5-DIGIT CODE</Text>
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
              <Text style={[styles.connectedBadgeText, { color: activeColors.foreground }]}>{stage === 'paired' ? 'TV paired' : stage === 'connecting' ? 'Connecting directly' : localPlayback ? videoStreaming ? 'Connected · Playing on TV' : 'Connected · Opening video' : stage === 'sending' ? 'Sending to TV' : 'Sent to TV'}</Text>
            </View>
            <Text style={[styles.title, { color: activeColors.foreground }]}>{stage === 'sent' ? selectedMedia?.kind === 'video' ? 'Playing on the TV.' : mediaQueue.length > 1 ? 'Your photos are on the TV.' : 'It’s on the TV.' : 'Choose what to play.'}</Text>
            <Text style={[styles.subtitle, { color: activeColors.mutedForeground }]}>
              {stage === 'sent'
                ? isUrlPlayback
                  ? 'The TV is playing directly from the video source.'
                  : selectedMedia?.kind === 'video'
                    ? localPlayback
                      ? backgroundEnabled
                        ? 'The TV is playing directly from your phone. You can switch apps; the casting notification stays active until you disconnect.'
                        : 'The TV is playing directly from your phone. Keep FrameCast open while it plays.'
                      : transferNotice ? 'The TV started the video after it finished sending.' : 'The TV played the video while it arrived.'
                    : mediaQueue.length > 1
                      ? sentQueueCount === mediaQueue.length
                        ? `${mediaQueue.length} photos are ready. Tap a thumbnail to show it on the TV.`
                        : `${sentQueueCount} of ${mediaQueue.length} photos sent.`
                      : 'The TV starts showing the photo automatically.'
                : selectedMedia?.kind === 'video'
                  ? isUrlPlayback ? 'The TV opens this link directly. The source must allow playback on the TV.' : Platform.OS !== 'web' ? 'Play directly over the same Wi-Fi without sending the whole file first. The TV must support the video format.' : 'MP4 and MOV videos are prepared on the phone for streaming. Other small videos transfer first; the TV must support their codec.'
                  : 'Your media goes directly to the TV over WebRTC. It is not uploaded to FrameCast.'}
            </Text>

            {Boolean(roomId) && !isPremium && !subscriptionLoading && Platform.OS !== 'web' && pairingAdStatus === 'loading' && (
              <Text style={[styles.progressCopy, { color: activeColors.mutedForeground }]} accessibilityLiveRegion="polite">
                Preparing your connection ad…
              </Text>
            )}
            {Boolean(roomId) && !isPremium && !subscriptionLoading && Platform.OS !== 'web' && pairingAdStatus === 'unavailable' && (
              <Text style={[styles.progressCopy, { color: activeColors.mutedForeground }]} accessibilityLiveRegion="polite">
                {pairingAdMessage || 'No ad is available right now. You can continue casting.'}
              </Text>
            )}
            {Boolean(roomId) && !isPremium && !subscriptionLoading && Platform.OS === 'android' && betweenVideoAdStatus === 'loading' && (
              <Text style={[styles.progressCopy, { color: activeColors.mutedForeground }]} accessibilityLiveRegion="polite">
                This video has ended. The next one will start after the ad break.
              </Text>
            )}
            {Boolean(roomId) && !isPremium && !subscriptionLoading && Platform.OS === 'android' && betweenVideoAdStatus === 'idle' && betweenVideoAdMessage ? (
              <Text style={[styles.progressCopy, { color: activeColors.mutedForeground }]} accessibilityLiveRegion="polite">
                {betweenVideoAdMessage}
              </Text>
            ) : null}

            {castTab === 'screen' && (
              <View style={[styles.videoLinkCard, { backgroundColor: activeColors.card, borderColor: activeColors.border }]} testID="screen-mirroring-card">
                <Text style={[styles.buttonTitle, { color: activeColors.foreground }]}>Mirror your phone screen</Text>
                <Text style={[styles.urlHelp, { color: activeColors.mutedForeground }]}>
                  Android asks you to approve screen sharing and playback-audio capture. Everything visible on your phone, including notifications, can appear on the TV. Supported app audio goes directly to the TV; protected apps may block video or sound. FrameCast does not record microphone audio.
                </Text>
                <Text style={[styles.urlHelp, { color: activeColors.mutedForeground }]}>
                  {isPremium
                    ? 'Premium lets you mirror other apps while FrameCast runs in the background.'
                    : 'Screen mirroring needs Premium because FrameCast must stay active while another app is on screen.'}
                </Text>
                {screenMirrorActive ? (
                  <>
                    <Pressable
                      onPress={stopScreenMirror}
                      style={({ pressed }) => [styles.primaryButton, { backgroundColor: activeColors.destructive, opacity: pressed ? 0.86 : 1 }]}
                      accessibilityRole="button"
                      accessibilityLabel="Stop screen mirroring"
                      testID="button-stop-screen-mirroring"
                    >
                      <Ionicons name="stop-circle-outline" size={20} color={activeColors.destructiveForeground} />
                      <Text style={[styles.primaryButtonText, { color: activeColors.destructiveForeground }]}>Stop mirroring</Text>
                    </Pressable>
                  </>
                ) : (
                  <Pressable
                    onPress={() => requestScreenMirror()}
                    disabled={!roomId || screenMirrorStarting || stage === 'connecting' || stage === 'sending'}
                    style={({ pressed }) => [styles.primaryButton, { backgroundColor: activeColors.primary, opacity: !roomId || screenMirrorStarting || stage === 'connecting' || stage === 'sending' ? 0.55 : pressed ? 0.86 : 1 }]}
                    accessibilityRole="button"
                    accessibilityLabel="Start screen mirroring"
                    testID="button-start-screen-mirroring"
                  >
                    <Ionicons name="phone-portrait-outline" size={20} color={activeColors.primaryForeground} />
                    <Text style={[styles.primaryButtonText, { color: activeColors.primaryForeground }]}>
                      {screenMirrorStarting ? 'Waiting for permission…' : !roomId ? 'Connect to the TV first' : isPremium ? 'Start screen mirroring' : 'View Premium to mirror'}
                    </Text>
                  </Pressable>
                )}
              </View>
            )}
            {castTab !== 'url' && castTab !== 'screen' && ((castTab === 'videos' ? selectedMedia?.kind === 'video' && !isUrlPlayback : selectedMedia?.kind === 'image') && selectedMedia ? (
              <MediaPlaylist
                items={mediaQueue.length ? mediaQueue : [selectedMedia]}
                selectedIndex={Math.min(queueIndex, Math.max(0, mediaQueue.length - 1))}
                thumbnails={videoThumbnails}
                paused={paused || videoEnded}
                status={selectedMedia.kind === 'video'
                  ? videoStreaming && !paused && !videoEnded ? 'Playing' : stage === 'sending' ? 'Starting' : 'Ready'
                  : stage === 'sending' ? 'Sending' : 'Ready'}
                canAdd={stage !== 'sending' && stage !== 'connecting' && mediaQueue.length < MAX_MEDIA_SELECTION_ITEMS}
                bulkSelectionUnlocked={isPremium}
                adsEnabled={!isPremium && !subscriptionLoading}
                addBusy={rewardedAdLoading || preparingMedia}
                canControlVideo={stage === 'sent' || videoStreaming || localPlayback}
                canSelectItem={(index) => mediaQueue[index]?.kind === 'video' || stage !== 'sending' || index < sentQueueCount}
                colors={{
                  background: activeColors.background,
                  card: activeColors.card,
                  border: activeColors.border,
                  foreground: activeColors.foreground,
                  mutedForeground: activeColors.mutedForeground,
                  primary: activeColors.primary,
                  primaryForeground: activeColors.primaryForeground,
                  secondary: activeColors.secondary,
                }}
                onSelect={playQueuedItem}
                onAdd={() => requestMoreMedia(selectedMedia.kind)}
                onChange={() => void (selectedMedia.kind === 'video' ? pickVideo() : pickPhotos())}
                onPlayPause={() => sendPlaybackControl(paused || videoEnded ? 'play' : 'pause')}
                onPrevious={() => playQueuedItem(queueIndex - 1)}
                onNext={() => playQueuedItem(queueIndex + 1)}
              />
            ) : castTab === 'images' ? (
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
                    <Text style={[styles.buttonTitle, { color: activeColors.foreground }]}>{mediaSelectionTitle('image')}</Text>
                    <Text style={[styles.buttonSubtitle, { color: activeColors.mutedForeground }]}>{mediaSelectionSubtitle('image')}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={activeColors.mutedForeground} />
                </Pressable>
            ) : (
                <Pressable
                  onPress={() => void pickVideo()}
                  disabled={preparingMedia || rewardedAdLoading}
                  style={({ pressed }) => [styles.chooseButton, { backgroundColor: activeColors.card, borderColor: activeColors.border, opacity: pressed ? 0.82 : 1 }]}
                  testID="button-choose-video"
                >
                  <View style={[styles.actionIcon, { backgroundColor: activeColors.secondary }]}>
                    <Ionicons name="videocam-outline" size={23} color={activeColors.primary} />
                  </View>
                  <View style={styles.scanButtonCopy}>
                      <Text style={[styles.buttonTitle, { color: activeColors.foreground }]}>{mediaSelectionTitle('video')}</Text>
                      <Text style={[styles.buttonSubtitle, { color: activeColors.mutedForeground }]}>{mediaSelectionSubtitle('video')}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={activeColors.mutedForeground} />
                </Pressable>
            ))}
            {castTab === 'url' && stage !== 'connecting' && stage !== 'sending' && (
              <View style={[styles.videoLinkCard, { backgroundColor: activeColors.card, borderColor: activeColors.border }]}>
                <Text style={[styles.buttonTitle, { color: activeColors.foreground }]}>Play a video link</Text>
                <TextInput
                  value={videoLink}
                  onChangeText={(value) => {
                    setVideoLink(value);
                    setVideoLinkError('');
                  }}
                  style={[styles.urlInput, { borderColor: activeColors.border, backgroundColor: activeColors.background, color: activeColors.foreground }]}
                  placeholder="https://example.com/video"
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
                {Platform.OS === 'android' ? (
                  <Pressable
                    onPress={() => {
                      Keyboard.dismiss();
                      setVideoLinkError('');
                      setVideoBrowserOpen(true);
                    }}
                    disabled={checkingVideoLink}
                    style={({ pressed }) => [styles.secondaryButton, { backgroundColor: activeColors.secondary, opacity: checkingVideoLink ? 0.5 : pressed ? 0.82 : 1 }]}
                    accessibilityRole="button"
                    accessibilityLabel="Browse a website and detect a video"
                    testID="button-open-video-browser"
                  >
                    <Ionicons name="globe-outline" size={17} color={activeColors.foreground} />
                    <Text style={[styles.secondaryButtonText, { color: activeColors.foreground }]}>Browse & detect video</Text>
                  </Pressable>
                ) : null}
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
                <Text style={[styles.urlHelp, { color: activeColors.mutedForeground }]}>Paste a supported video or webpage link, then tap Play on TV. Playback depends on the website and your TV. Some links require sign-in or do not allow playback on another screen.</Text>
              </View>
            )}
            {castTab === 'images' && selectedMedia?.kind === 'image' && stage !== 'sending' && (
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
                {formatBytes(sentBytes)} of {formatBytes(totalBytes)} sent · {backgroundEnabled ? 'you can switch apps while casting' : 'keep FrameCast open'}
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
                <View style={styles.playbackRow} testID="video-display-controls">
                  <Pressable
                    style={[styles.secondaryButton, { backgroundColor: activeColors.secondary }]}
                    onPress={() => sendPlaybackControl('video:fit:contain')}
                    accessibilityRole="button"
                    accessibilityLabel="Fit whole video on TV"
                    testID="button-phone-video-fit"
                  >
                    <Text style={[styles.secondaryButtonText, { color: activeColors.foreground }]}>Fit whole video</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.secondaryButton, { backgroundColor: activeColors.secondary }]}
                    onPress={() => sendPlaybackControl('video:fullscreen')}
                    accessibilityRole="button"
                    accessibilityLabel="Enter full screen on TV"
                    testID="button-phone-video-fullscreen"
                  >
                    <Ionicons name="expand-outline" size={18} color={activeColors.foreground} />
                    <Text style={[styles.secondaryButtonText, { color: activeColors.foreground }]}>Full screen on TV</Text>
                  </Pressable>
                </View>
                {fullscreenNotice ? (
                  <Text style={[styles.progressCopy, { color: activeColors.mutedForeground }]} accessibilityLabel={fullscreenNotice} testID="text-phone-fullscreen-notice">
                    {fullscreenNotice}
                  </Text>
                ) : null}
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
                    <Pressable style={[styles.secondaryButton, { backgroundColor: activeColors.secondary }]} onPress={() => sendPlaybackControl('video:mute')} accessibilityLabel={remoteVideoPosition.volume <= 0 ? 'Unmute TV' : 'Mute TV'} testID="button-phone-video-mute">
                      <Ionicons name={remoteVideoPosition.volume <= 0 ? 'volume-mute' : 'volume-high'} size={18} color={activeColors.foreground} />
                      <Text style={[styles.secondaryButtonText, { color: activeColors.foreground }]}>{remoteVideoPosition.volume <= 0 ? 'Unmute' : 'Mute'}</Text>
                    </Pressable>
                    <Pressable style={[styles.secondaryButton, { backgroundColor: activeColors.secondary }]} onPress={() => { cleanupTemporaryCopies(); clearVideoThumbnailData(); setSelectedMedia(null); setMediaQueue([]); mediaQueueRef.current = []; setStage('paired'); setVideoEnded(false); setSentBytes(0); closePeer(true); }} testID="button-stop-tv">
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
                <View style={styles.playbackRow} testID="photo-remote-pan">
                  <Pressable style={[styles.secondaryButton, { backgroundColor: activeColors.secondary }]} onPress={() => sendPlaybackControl('photo:move-up')} accessibilityLabel="Move photo up on TV" testID="button-phone-photo-move-up">
                    <Ionicons name="arrow-up" size={18} color={activeColors.foreground} />
                    <Text style={[styles.secondaryButtonText, { color: activeColors.foreground }]}>Move up</Text>
                  </Pressable>
                  <Pressable style={[styles.secondaryButton, { backgroundColor: activeColors.secondary }]} onPress={() => sendPlaybackControl('photo:move-down')} accessibilityLabel="Move photo down on TV" testID="button-phone-photo-move-down">
                    <Ionicons name="arrow-down" size={18} color={activeColors.foreground} />
                    <Text style={[styles.secondaryButtonText, { color: activeColors.foreground }]}>Move down</Text>
                  </Pressable>
                </View>
              </>
            )}

            {stage !== 'sending' && stage !== 'connecting' && !unsupportedVideoHelpVisible && selectedMedia && !isUrlPlayback && castTab === (selectedMedia.kind === 'video' ? 'videos' : 'images') && (Boolean(error) || (stage === 'sent' && mediaQueue.length > 1)) && (
              <Pressable
                onPress={() => void startTransfer()}
                style={({ pressed }) => [styles.primaryButton, { backgroundColor: activeColors.primary, opacity: pressed ? 0.86 : 1 }]}
                testID="button-send-to-tv"
              >
                <Ionicons name={error ? 'refresh' : 'play'} size={18} color={activeColors.primaryForeground} />
                <Text style={[styles.primaryButtonText, { color: activeColors.primaryForeground }]}>
                  {error ? 'Try again' : selectedMedia.kind === 'video' ? 'Replay playlist' : `Replay ${mediaQueue.length} photos`}
                </Text>
              </Pressable>
            )}

            {(stage === 'sending' || stage === 'connecting') && (
              <View style={styles.loadingRow}>
                <ActivityIndicator color={activeColors.primary} />
                <Text style={[styles.progressCopy, { color: activeColors.mutedForeground }]}>{localPlayback ? 'Opening the video over Wi-Fi…' : stage === 'connecting' ? 'Creating a direct connection…' : 'Sending directly to the TV…'}</Text>
              </View>
            )}
            <Pressable
              onPress={leaveRoom}
              style={({ pressed }) => [styles.leaveButton, { backgroundColor: activeColors.destructive, opacity: pressed ? 0.85 : 1 }]}
              accessibilityRole="button"
              accessibilityLabel="Disconnect from this TV"
              testID="button-leave-room"
            >
              <Ionicons name="unlink-outline" size={21} color={activeColors.destructiveForeground} />
              <Text style={[styles.leaveText, { color: activeColors.destructiveForeground }]}>Disconnect from this TV</Text>
            </Pressable>
          </View>
        )}

        <View style={[styles.privacyNote, { borderTopColor: activeColors.border }]}>
          <Ionicons name="shield-checkmark-outline" size={18} color={activeColors.primary} />
          <Text style={[styles.privacyText, { color: activeColors.mutedForeground }]}>
            Pairing stays active while in use and expires after 4 hours without activity. Phone media is not stored on our servers. Temporary on-device copies can be removed in Settings. For a video link, the TV requests playback from the original site.
          </Text>
        </View>

        {transferNotice ? <Text style={[styles.progressCopy, { color: activeColors.mutedForeground }]}>{transferNotice}</Text> : null}
        {error ? (
          <View style={[styles.errorBox, { backgroundColor: activeColors.secondary }]} testID="text-error">
            <Ionicons name="alert-circle-outline" size={18} color={activeColors.destructive} />
            <Text style={[styles.errorText, { color: activeColors.destructive }]}>{error}</Text>
          </View>
        ) : null}
        {unsupportedVideoHelpVisible && (
          <View style={[styles.videoLinkCard, { backgroundColor: activeColors.card, borderColor: activeColors.border }]} testID="unsupported-video-help">
            <Text style={[styles.buttonTitle, { color: activeColors.foreground }]}>Try an H.264/AVC MP4</Text>
            <Text style={[styles.urlHelp, { color: activeColors.mutedForeground }]}>
              The TV did not report the exact codec. Convert the video to MP4 with H.264/AVC video and AAC audio, then return to FrameCast and choose the converted file. CloudConvert is external: FrameCast will not upload your video, but anything you upload there is processed by that service. Avoid uploading private videos.
            </Text>
            <Pressable
              onPress={() => {
                void Linking.openURL(CLOUDCONVERT_VIDEO_URL).catch(() => {
                  setError(`Could not open CloudConvert. Visit ${CLOUDCONVERT_VIDEO_URL} in your browser.`);
                });
              }}
              style={({ pressed }) => [styles.primaryButton, { backgroundColor: activeColors.primary, opacity: pressed ? 0.86 : 1 }]}
              accessibilityRole="button"
              testID="button-open-cloudconvert"
            >
              <Ionicons name="open-outline" size={18} color={activeColors.primaryForeground} />
              <Text style={[styles.primaryButtonText, { color: activeColors.primaryForeground }]}>Open CloudConvert</Text>
            </Pressable>
          </View>
        )}
        {messagesQuery.isError && roomId ? (
          <Text style={[styles.errorText, { color: activeColors.destructive }]}>Could not reach the TV. Check that its FrameCast page is still open.</Text>
        ) : null}
      </ScrollView>
      {Boolean(roomId) && !isPremium && !subscriptionLoading && Platform.OS === 'android' && pairingAdStatus !== 'loading' && (
        <CastingBannerAd
          backgroundColor={activeColors.background}
          borderColor={activeColors.border}
        />
      )}
    </SafeAreaView>
    </>
  );
}

export default function HomeScreen() {
  return (
    <SubscriptionChoiceGate>
      <FrameCastHomeScreen />
    </SubscriptionChoiceGate>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingHorizontal: 22, paddingBottom: 24 },
  header: { height: 54, flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandMark: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  brand: { fontFamily: 'Inter_700Bold', fontSize: 20, letterSpacing: -0.7 },
  privacyChip: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20 },
  privacyChipText: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 0.9 },
  main: { paddingTop: 24, flexGrow: 1 },
  kicker: { fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 1.4, marginBottom: 10 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 32, lineHeight: 38, letterSpacing: -1.1 },
  subtitle: { fontFamily: 'Inter_400Regular', fontSize: 15, lineHeight: 22, marginTop: 10, marginBottom: 16 },
  tvAddressHint: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 13, paddingVertical: 10, marginBottom: 12, gap: 3 },
  tvAddressLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 10, letterSpacing: 0.7, textTransform: 'uppercase' },
  tvAddress: { fontFamily: 'Inter_600SemiBold', fontSize: 22, lineHeight: 28 },
  pairCard: { borderWidth: 1, borderRadius: 24, padding: 16 },
  tvDiscoverySection: { gap: 10, marginBottom: 16 },
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
  cameraClose: { position: 'absolute', right: 12, top: 12, width: 38, height: 38, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(84,36,143,0.78)' },
  cameraCaption: { position: 'absolute', left: 14, right: 14, bottom: 14, padding: 11, borderRadius: 12, backgroundColor: 'rgba(84,36,143,0.88)' },
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
  leaveButton: { minHeight: 56, paddingHorizontal: 20, paddingVertical: 16, marginTop: 10, borderRadius: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  leaveText: { fontFamily: 'Inter_700Bold', fontSize: 16 },
  privacyNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderTopWidth: 1, paddingTop: 17, marginTop: 28 },
  privacyText: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18 },
  errorBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12, borderRadius: 13, marginTop: 14 },
  errorText: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 12, lineHeight: 18 },
});
