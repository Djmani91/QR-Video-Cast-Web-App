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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { File as ExpoFile } from 'expo-file-system';
import { Ionicons } from '@expo/vector-icons';
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
};

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

const rtcConfig = { iceServers: [] };
const FILE_CHUNK_SIZE = 32 * 1024;
const MAX_TRANSFER_BYTES = 256 * 1024 * 1024;

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
  const [error, setError] = useState('');
  const [stage, setStage] = useState<'join' | 'paired' | 'connecting' | 'sending' | 'sent'>('join');
  const [sentBytes, setSentBytes] = useState(0);
  const [totalBytes, setTotalBytes] = useState(0);
  const [paused, setPaused] = useState(false);
  const transferComplete = useRef(false);
  const peerRef = useRef<PeerLike | null>(null);
  const mediaChannelRef = useRef<DataChannelLike | null>(null);
  const controlChannelRef = useRef<DataChannelLike | null>(null);
  const seenMessages = useRef(new Set<number>());
  const queuedIce = useRef<Record<string, unknown>[]>([]);
  const scanHandled = useRef(false);

  const messagesQuery = useGetCastRoomMessages(roomId, {
    query: {
      queryKey: getGetCastRoomMessagesQueryKey(roomId),
      refetchInterval: 700,
      enabled: Boolean(roomId),
    },
  });
  const messages = (messagesQuery.data ?? []) as SignalMessage[];

  const sendSignal = useCallback((type: CastSignalType, payload: Record<string, unknown> = {}) => {
    if (!roomId) return;
    sendSignalRef.current(
      { roomId, data: { from: 'phone', type, payload } },
      { onError: () => setError('The TV connection signal could not be sent. Check both devices are online and try again.') },
    );
  }, [roomId]);

  const closePeer = useCallback((notifyTv = false) => {
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
  }, []);

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
        setStage('paired');
        setError('The TV ended this connection.');
      }
    }
  }, [messages, closePeer]);

  const joinRoom = (id: string) => {
    if (!id) {
      setError('That QR code does not contain a FrameCast room. Scan the code shown on the TV.');
      return;
    }
    closePeer(true);
    setRoomId(id);
    setSelectedMedia(null);
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

  const pickMedia = async () => {
    setError('');
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsEditing: false,
      selectionLimit: 1,
      quality: 1,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const mediaKind = asset.type === 'video' ? 'video' : 'image';
    setSelectedMedia({
      uri: asset.uri,
      name: asset.fileName || (mediaKind === 'video' ? 'Video' : 'Photo'),
      mimeType: asset.mimeType || (mediaKind === 'video' ? 'video/mp4' : 'image/jpeg'),
      kind: mediaKind,
      size: asset.fileSize ?? undefined,
    });
    closePeer(true);
    setStage('paired');
    setSentBytes(0);
    setTotalBytes(0);
  };

  const startTransfer = async () => {
    if (!roomId || !selectedMedia) {
      setError('Choose a video or photo first.');
      return;
    }
    setError('');
    setStage('connecting');
    setSentBytes(0);
    setTotalBytes(0);
    closePeer();
    queuedIce.current = [];
    try {
      const file = new ExpoFile(selectedMedia.uri);
      const fileSize = file.size || selectedMedia.size || 0;
      if (!fileSize) throw new Error('The selected file size could not be read.');
      if (fileSize > MAX_TRANSFER_BYTES) {
        throw new Error('This first version supports files up to 256 MB. Choose a shorter or smaller video.');
      }
      setTotalBytes(fileSize);
      transferComplete.current = false;

      const peer = createPeerConnection();
      peerRef.current = peer;
      const mediaChannel = peer.createDataChannel('framecast-media');
      mediaChannelRef.current = mediaChannel;
      mediaChannel.onmessage = (event) => {
        if (typeof event.data !== 'string') return;
        try {
          const packet = JSON.parse(event.data) as { framecast?: string };
          if (packet.framecast === 'received') {
            transferComplete.current = true;
            setSentBytes(fileSize);
            setStage('sent');
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
      };
      mediaChannel.onopen = () => {
        void (async () => {
          try {
            setStage('sending');
            mediaChannel.send(JSON.stringify({
              framecast: 'metadata',
              name: selectedMedia.name,
              mimeType: selectedMedia.mimeType,
              kind: selectedMedia.kind,
              size: fileSize,
            }));
            for (let offset = 0; offset < fileSize; offset += FILE_CHUNK_SIZE) {
              if (mediaChannel.readyState !== 'open') throw new Error('The TV connection closed during transfer.');
              await waitForBuffer(mediaChannel);
              const part = await file.slice(offset, Math.min(offset + FILE_CHUNK_SIZE, fileSize)).arrayBuffer();
              mediaChannel.send(part);
              const count = Math.min(offset + part.byteLength, fileSize);
              setSentBytes(count);
            }
            await waitForBuffer(mediaChannel);
            mediaChannel.send(JSON.stringify({ framecast: 'complete' }));
            setSentBytes(fileSize);
          } catch (transferError) {
            setStage('paired');
            setError(transferError instanceof Error ? transferError.message : 'The video could not be sent. Try again.');
          }
        })();
      };
      mediaChannel.onclose = () => {
        if (!transferComplete.current) {
          setStage('paired');
          setError('The direct transfer was interrupted. Keep both devices awake and try again.');
        }
      };
      peer.onicecandidate = (event) => {
        if (event.candidate) sendSignal('ice', event.candidate.toJSON());
      };
      peer.onconnectionstatechange = () => {
        if (peer.connectionState === 'failed') {
          setStage('paired');
          setError('A direct connection could not be made. Check both devices are on the same Wi-Fi network.');
        } else if (peer.connectionState === 'disconnected') {
          setStage('paired');
          setError('The direct connection was interrupted. Reconnect and try again.');
        }
      };
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      sendSignal('offer', {
        type: offer.type,
        sdp: offer.sdp,
        mediaKind: selectedMedia.kind,
        transport: 'data-channel',
      });
    } catch (transferError) {
      closePeer();
      setStage('paired');
      setError(transferError instanceof Error ? transferError.message : 'Could not start the direct transfer.');
    }
  };

  const sendPlaybackControl = (action: 'play' | 'pause') => {
    const channel = controlChannelRef.current;
    if (channel?.readyState !== 'open') return;
    channel.send(action);
    setPaused(action === 'pause');
  };

  const leaveRoom = () => {
    closePeer(true);
    setRoomId('');
    setSelectedMedia(null);
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
            <Text style={[styles.subtitle, { color: activeColors.mutedForeground }]}>Pair with the FrameCast page open on your TV, then choose a photo or video.</Text>

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
            <Text style={[styles.title, { color: activeColors.foreground }]}>{stage === 'sent' ? 'It’s on the TV.' : 'Choose what to play.'}</Text>
            <Text style={[styles.subtitle, { color: activeColors.mutedForeground }]}>
              {stage === 'sent' ? 'The TV starts playing automatically when the transfer finishes.' : 'Your media goes directly to the TV over WebRTC. It is not uploaded to FrameCast.'}
            </Text>

            {selectedMedia ? (
              <View style={[styles.mediaCard, { backgroundColor: activeColors.card, borderColor: activeColors.border }]}>
                <View style={[styles.mediaIcon, { backgroundColor: activeColors.secondary }]}>
                  <Ionicons name={selectedMedia.kind === 'video' ? 'videocam-outline' : 'image-outline'} size={24} color={activeColors.primary} />
                </View>
                <View style={styles.mediaCopy}>
                  <Text numberOfLines={1} style={[styles.mediaName, { color: activeColors.foreground }]}>{selectedMedia.name}</Text>
                  <Text style={[styles.mediaMeta, { color: activeColors.mutedForeground }]}>{selectedMedia.size ? formatBytes(selectedMedia.size) : selectedMedia.kind === 'video' ? 'Video' : 'Photo'}</Text>
                </View>
                <Pressable onPress={() => void pickMedia()} accessibilityLabel="Choose different media" testID="button-change-media">
                  <Ionicons name="swap-horizontal-outline" size={21} color={activeColors.mutedForeground} />
                </Pressable>
              </View>
            ) : (
              <Pressable
                onPress={() => void pickMedia()}
                style={({ pressed }) => [styles.chooseButton, { backgroundColor: activeColors.card, borderColor: activeColors.border, opacity: pressed ? 0.82 : 1 }]}
                testID="button-choose-media"
              >
                <View style={[styles.actionIcon, { backgroundColor: activeColors.secondary }]}>
                  <Ionicons name="images-outline" size={23} color={activeColors.primary} />
                </View>
                <View style={styles.scanButtonCopy}>
                  <Text style={[styles.buttonTitle, { color: activeColors.foreground }]}>Choose photo or video</Text>
                  <Text style={[styles.buttonSubtitle, { color: activeColors.mutedForeground }]}>From your phone’s library</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={activeColors.mutedForeground} />
              </Pressable>
            )}

            {(stage === 'sending' || stage === 'sent') && selectedMedia?.kind === 'video' && (
              <View style={[styles.progressTrack, { backgroundColor: activeColors.secondary }]} testID="transfer-progress">
                <View style={[styles.progressFill, { backgroundColor: activeColors.primary, width: `${stage === 'sent' ? 100 : progress}%` }]} />
              </View>
            )}
            {stage === 'sending' && totalBytes ? (
              <Text style={[styles.progressCopy, { color: activeColors.mutedForeground }]}>{formatBytes(sentBytes)} of {formatBytes(totalBytes)} sent · keep this app open</Text>
            ) : null}

            {stage === 'sent' && selectedMedia?.kind === 'video' && (
              <View style={styles.playbackRow}>
                <Pressable style={[styles.secondaryButton, { backgroundColor: activeColors.secondary }]} onPress={() => sendPlaybackControl(paused ? 'play' : 'pause')} testID="button-phone-play-pause">
                  <Ionicons name={paused ? 'play' : 'pause'} size={18} color={activeColors.foreground} />
                  <Text style={[styles.secondaryButtonText, { color: activeColors.foreground }]}>{paused ? 'Play on TV' : 'Pause TV'}</Text>
                </Pressable>
                <Pressable style={[styles.secondaryButton, { backgroundColor: activeColors.secondary }]} onPress={() => { setSelectedMedia(null); setStage('paired'); setSentBytes(0); closePeer(true); }} testID="button-stop-tv">
                  <Ionicons name="stop" size={18} color={activeColors.foreground} />
                  <Text style={[styles.secondaryButtonText, { color: activeColors.foreground }]}>Stop</Text>
                </Pressable>
              </View>
            )}

            {stage !== 'sending' && stage !== 'connecting' && stage !== 'sent' && selectedMedia && (
              <Pressable
                onPress={() => void startTransfer()}
                style={({ pressed }) => [styles.primaryButton, { backgroundColor: activeColors.primary, opacity: pressed ? 0.86 : 1 }]}
                testID="button-send-to-tv"
              >
                <Ionicons name="play" size={18} color={activeColors.primaryForeground} />
                <Text style={[styles.primaryButtonText, { color: activeColors.primaryForeground }]}>Send to TV</Text>
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
            Pairing signals expire after 10 minutes. Photos and videos travel directly between devices and are not stored on the server. Keep both devices on the same Wi-Fi.
          </Text>
        </View>

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
  scanButton: { minHeight: 78, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 17, paddingHorizontal: 13, gap: 12 },
  actionIcon: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  scanButtonCopy: { flex: 1 },
  buttonTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  buttonSubtitle: { fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 4 },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 22, marginBottom: 15 },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { fontFamily: 'Inter_600SemiBold', fontSize: 9, letterSpacing: 1.2 },
  codeInput: { height: 62, borderWidth: 1, borderRadius: 16, fontFamily: 'Inter_700Bold', fontSize: 25, letterSpacing: 8, textAlign: 'center', paddingLeft: 8 },
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
  progressTrack: { height: 8, borderRadius: 10, overflow: 'hidden', marginTop: 22 },
  progressFill: { height: '100%', borderRadius: 10 },
  progressCopy: { fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18, marginTop: 9 },
  loadingRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  playbackRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  secondaryButton: { flex: 1, minHeight: 48, borderRadius: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  secondaryButtonText: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  leaveButton: { alignSelf: 'center', paddingVertical: 18, marginTop: 4 },
  leaveText: { fontFamily: 'Inter_500Medium', fontSize: 13 },
  privacyNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderTopWidth: 1, paddingTop: 17, marginTop: 28 },
  privacyText: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18 },
  errorBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12, borderRadius: 13, marginTop: 14 },
  errorText: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 12, lineHeight: 18 },
});
