import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { File, Paths } from 'expo-file-system';
import { useColors } from '@/hooks/useColors';
import { useSubscription } from '@/lib/revenuecat';
import { useSubscriptionChoiceGate } from './SubscriptionChoiceGate';
import { CastingBannerAd } from './CastingBannerAd';
import { connectDirect, controlDirect, directMediaMime, disconnectDirect, loadDirect, statusDirect, type DirectStatus, type DirectTarget } from '@/lib/direct-cast';
import { startLocalStream, stopLocalStream } from '@/lib/local-stream';
import { showSelectionRewardedAd } from '@/lib/ad-monetization';
import { shouldUnlockExtraMedia } from '@/lib/rewarded-media-policy';
import { onBackgroundControl, startBackgroundCasting, stopBackgroundCasting, updateBackgroundCasting } from '@/lib/background-casting';

type Item = { uri: string; name: string; mime: string; kind: 'image' | 'video'; temporary: boolean };
type Props = { target: DirectTarget; onClose(): void };
const emptyStatus: DirectStatus = { state: 'READY', position: 0, duration: 0 };
const detail = (error: unknown) => error instanceof Error ? error.message : String(error);
const time = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

/** Direct receivers are deliberately separate from browser rooms and WebRTC signaling. */
export default function DirectCastPanel({ target, onClose }: Props) {
  const colors = useColors();
  const { isPremium, loading: subscriptionLoading } = useSubscription();
  const { openPaywall, openFirstPairChoice } = useSubscriptionChoiceGate();
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState(`Connecting to ${target.name}…`);
  const [error, setError] = useState('');
  const [queue, setQueue] = useState<Item[]>([]);
  const [index, setIndex] = useState(-1);
  const [status, setStatus] = useState<DirectStatus>(emptyStatus);
  const [url, setUrl] = useState('');
  const live = useRef(true);
  const closingRef = useRef(false);
  const cleanedRef = useRef(false);
  const busyRef = useRef(true);
  const premiumRef = useRef(isPremium);
  const loadingRef = useRef(subscriptionLoading);
  const adRef = useRef(false);
  const connectedRef = useRef(false);
  const queueRef = useRef<Item[]>([]);
  const indexRef = useRef(-1);
  const countRef = useRef({ image: 0, video: 0 });
  const unlockedRef = useRef({ image: false, video: false });
  const temporaryFiles = useRef(new Set<string>());
  const playedRef = useRef(false);
  const pausedForBackground = useRef(false);
  const statusRef = useRef(emptyStatus);
  const playRef = useRef<(i: number) => Promise<void>>(async () => undefined);
  const controlRef = useRef<(action: string) => void>(() => undefined);
  const operations = useRef(Promise.resolve());
  premiumRef.current = isPremium;
  loadingRef.current = subscriptionLoading;

  // One ordered native/media operation at a time, including disconnect cleanup.
  const ordered = <T,>(operation: () => Promise<T>): Promise<T> => {
    const next = operations.current.then(operation);
    operations.current = next.then(() => undefined, () => undefined);
    return next;
  };
  const busyState = (value: boolean) => {
    if (!value && closingRef.current) return;
    busyRef.current = value;
    if (live.current) setBusy(value);
  };
  const cleanup = async () => {
    if (cleanedRef.current) return;
    cleanedRef.current = true;
    const results = await Promise.allSettled([disconnectDirect(), stopLocalStream(), stopBackgroundCasting()]);
    try {
      for (const uri of temporaryFiles.current) {
        try { const file = new File(uri); if (file.exists) file.delete(); } catch { /* Next cache cleanup can remove a locked file. */ }
      }
      temporaryFiles.current.clear();
    } finally {
      const failed = results.find(result => result.status === 'rejected');
      if (failed?.status === 'rejected') throw failed.reason;
    }
  };
  const close = async () => {
    if (closingRef.current) return;
    closingRef.current = true;
    busyState(true);
    connectedRef.current = false;
    setConnected(false);
    setMessage('Disconnecting from the TV…');
    try { await ordered(cleanup); }
    catch (e) { Alert.alert('Disconnect notice', detail(e)); }
    finally { onClose(); }
  };

  useEffect(() => {
    live.current = true;
    void ordered(async () => {
      try {
        await connectDirect(target);
        if (!live.current || closingRef.current) return;
        connectedRef.current = true;
        setConnected(true);
        setMessage('Receiver connected. Choose a photo or video to play.');
        openFirstPairChoice();
      } catch (e) {
        if (live.current) { setError(detail(e)); setMessage('Could not connect to the receiver.'); }
      } finally { busyState(false); }
    });
    return () => {
      live.current = false;
      connectedRef.current = false;
      void ordered(cleanup).catch(() => undefined);
    };
  }, []); // A selected target owns this panel for its lifetime.

  const play = async (nextIndex: number) => {
    if (!connectedRef.current || busyRef.current || !queueRef.current[nextIndex]) return;
    busyState(true);
    setError('');
    setMessage('Opening your media on the TV…');
    playedRef.current = false;
    try {
      await ordered(async () => {
        const item = queueRef.current[nextIndex];
        if (!live.current || !item) return;
        // End the previous read before replacing the selected-file server.
        if (indexRef.current >= 0) await controlDirect('stop');
        let source = item.uri;
        if (!/^https?:\/\//i.test(source)) {
          const stream = await startLocalStream(item.uri, item.name, target.protocol === 'googlecast');
          source = stream.receiverUrl.replace(/receiver\.html$/, `media${stream.extension}`);
        } else await stopLocalStream();
        if (!live.current) return;
        await loadDirect(source, item.mime, item.name);
        if (!live.current) return;
        indexRef.current = nextIndex;
        statusRef.current = emptyStatus;
        setStatus(emptyStatus);
        setIndex(nextIndex);
        setMessage('The TV accepted the media. Waiting for playback…');
        // A picker/ad is allowed in the foreground; playback itself is not allowed
        // to start after a free user leaves FrameCast while a request is pending.
        if (AppState.currentState !== 'active' && !premiumRef.current) {
          await controlDirect('stop');
          pausedForBackground.current = true;
          setMessage('Free playback stopped because FrameCast is in the background.');
        }
      });
    } catch (e) {
      if (live.current) { setError(detail(e)); setMessage('The TV could not open this media.'); }
    } finally { busyState(false); }
  };
  playRef.current = play;

  useEffect(() => {
    if (!connected) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let failures = 0;
    const poll = async () => {
      if (cancelled) return;
      if (!busyRef.current) {
        try {
          const result = await statusDirect();
          if (cancelled) return;
          failures = 0;
          statusRef.current = result;
          setStatus(result);
          if (indexRef.current >= 0) {
            if (result.state === 'PLAYING') {
              playedRef.current = true;
              setMessage('Playing on your TV');
            } else if (result.state === 'PAUSED_PLAYBACK') setMessage('Paused on your TV');
            else if (result.state === 'TRANSITIONING') setMessage('Loading on your TV…');
            else if (result.state === 'ERROR') {
              playedRef.current = false;
              setError('The receiver could not decode this media. Supported video formats depend on the TV model; try MP4 with H.264 video and AAC audio.');
            } else if (result.state === 'FINISHED' || (result.state === 'STOPPED' && playedRef.current
              && result.duration > 0 && result.position >= result.duration - 2)) {
              playedRef.current = false;
              const next = indexRef.current + 1;
              if (queueRef.current[next]?.kind === 'video' && !pausedForBackground.current
                && (premiumRef.current || AppState.currentState === 'active')) void playRef.current(next);
              else setMessage('Playback finished. Choose another item.');
            }
          }
        } catch (e) {
          if (cancelled) return;
          if (++failures >= 3) {
            connectedRef.current = false;
            setConnected(false);
            setMessage('Receiver connection lost. Return to scanning and reconnect.');
            setError(detail(e));
            void ordered(cleanup).catch(() => undefined);
            return;
          }
          setMessage('Checking the TV connection…');
        }
      }
      if (!cancelled) timer = setTimeout(poll, 1500);
    };
    void poll();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [connected]);

  const control = (action: string) => {
    if (!connectedRef.current || busyRef.current) return;
    if (action === 'next') { void playRef.current(indexRef.current + 1); return; }
    if (action === 'previous') { void playRef.current(indexRef.current - 1); return; }
    if (action === 'disconnect') { void close(); return; }
    const command = action === 'toggle'
      ? statusRef.current.state === 'PLAYING' ? 'pause' : 'play' : action;
    const position = action === 'back10' ? Math.max(0, statusRef.current.position - 10)
      : action === 'forward10' ? statusRef.current.position + 10 : 0;
    busyState(true);
    void ordered(async () => {
      await controlDirect(action.endsWith('10') ? 'seek' : command, position);
      if (command === 'play') pausedForBackground.current = false;
    }).catch(e => { if (live.current) setError(detail(e)); }).finally(() => busyState(false));
  };
  controlRef.current = control;

  useEffect(() => {
    if (!connected) return;
    const sub = AppState.addEventListener('change', state => {
      if (state !== 'background' || premiumRef.current || adRef.current) return;
      pausedForBackground.current = true;
      playedRef.current = false;
      void ordered(() => controlDirect('stop')).then(() => {
        if (live.current) setMessage('Playback stopped in the background. Your receiver connection is kept. Premium allows background casting.');
      }).catch(e => { if (live.current) setError(detail(e)); });
    });
    return () => sub.remove();
  }, [connected]);

  useEffect(() => {
    if (!connected || !isPremium || subscriptionLoading) return;
    let active = true;
    void startBackgroundCasting({ title: target.name, paused: true, position: 0, duration: 0 })
      .then(() => { if (!active) return stopBackgroundCasting(); })
      .catch(e => { if (active) setError(detail(e)); });
    return () => { active = false; void stopBackgroundCasting().catch(() => undefined); };
  }, [connected, isPremium, subscriptionLoading]);

  useEffect(() => {
    if (!isPremium || !connected) return;
    updateBackgroundCasting({
      title: queue[index]?.name ?? target.name, paused: status.state !== 'PLAYING',
      position: status.position, duration: status.duration,
    });
  }, [isPremium, connected, status, index, queue, target.name]);

  useEffect(() => onBackgroundControl(action => {
    const actions: Record<string, string> = {
      play: 'play', pause: 'pause', 'playlist:next': 'next', 'playlist:previous': 'previous',
      disconnect: 'disconnect',
    };
    if (actions[action]) controlRef.current(actions[action]);
  }), []);

  useEffect(() => {
    if (subscriptionLoading || isPremium || !connected || AppState.currentState !== 'background' || adRef.current) return;
    pausedForBackground.current = true;
    playedRef.current = false;
    void ordered(() => controlDirect('stop')).catch(e => {
      if (live.current) setError(detail(e));
    });
  }, [isPremium, subscriptionLoading, connected]);

  const allowance = async (kind: 'image' | 'video') => {
    if (loadingRef.current) throw new Error('Please wait while your Premium status is checked.');
    const count = countRef.current[kind];
    if (premiumRef.current) return Math.max(0, 20 - count);
    if (count === 0) return 1;
    if (count >= 2) { openPaywall(); return 0; }
    if (unlockedRef.current[kind]) return 1;
    const choice = await new Promise<'ad' | 'premium' | 'cancel'>(resolve => Alert.alert(
      'Add one more',
      'Watch an ad for one extra item, or get Premium for up to 20 photos and 20 videos plus background casting. If no ad is available, you can still add that extra item.',
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve('cancel') },
        { text: 'Watch ad', onPress: () => resolve('ad') },
        { text: 'Buy Premium', onPress: () => resolve('premium') },
      ], { cancelable: true, onDismiss: () => resolve('cancel') },
    ));
    if (choice === 'premium') { openPaywall(); return 0; }
    if (choice !== 'ad') return 0;
    adRef.current = true;
    try {
      const result = await showSelectionRewardedAd(
        () => live.current && connectedRef.current && !premiumRef.current,
        text => { if (live.current) setMessage(text); },
      );
      if (shouldUnlockExtraMedia(result)) { unlockedRef.current[kind] = true; return 1; }
      return 0;
    } finally { adRef.current = false; }
  };

  const choose = async (kind: 'image' | 'video') => {
    if (busyRef.current || !connectedRef.current) return;
    busyState(true);
    setError('');
    try {
      const slots = await allowance(kind);
      if (!slots || !live.current) return;
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: kind === 'image' ? ['images'] : ['videos'],
        allowsMultipleSelection: slots > 1, selectionLimit: slots, quality: 1,
      });
      if (result.canceled || !live.current) return;
      const items: Item[] = [];
      for (const asset of result.assets.slice(0, slots)) {
        let name = asset.fileName || `media.${kind === 'image' ? 'jpg' : 'mp4'}`;
        let uri = asset.uri;
        let mime = directMediaMime(name, asset.mimeType);
        let temporary = false;
        if (kind === 'image') {
          const image = await ImageManipulator.manipulateAsync(uri, [], { format: ImageManipulator.SaveFormat.JPEG, compress: 0.95 });
          uri = image.uri;
          name = name.replace(/\.[^.]+$/, '') + '.jpg';
          mime = 'image/jpeg';
          temporary = true;
        } else if (uri.startsWith('content://')) {
          const copy = new File(Paths.cache, `framecast-direct-${Date.now()}-${Math.random().toString(36).slice(2)}.${name.split('.').pop()}`);
          await new File(uri).copy(copy);
          uri = copy.uri;
          temporary = true;
        }
        if (temporary) temporaryFiles.current.add(uri);
        items.push({ uri, name, mime, kind, temporary });
      }
      if (!live.current) return;
      countRef.current[kind] += items.length;
      const first = queueRef.current.length;
      queueRef.current = [...queueRef.current, ...items];
      setQueue(queueRef.current);
      busyState(false);
      await playRef.current(first);
    } catch (e) { if (live.current) setError(detail(e)); }
    finally { busyState(false); }
  };

  const playUrl = async () => {
    if (busyRef.current || !connectedRef.current) return;
    busyState(true);
    setError('');
    try {
      const parsed = new URL(url.trim());
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('Use a direct HTTP or HTTPS video link.');
      const mime = directMediaMime(parsed.pathname);
      if (mime.startsWith('image/')) throw new Error('Use a video link here, or choose a photo from your phone.');
      const slots = await allowance('video');
      if (!slots || !live.current) return;
      countRef.current.video++;
      const next = queueRef.current.length;
      queueRef.current = [...queueRef.current, { uri: parsed.href, name: parsed.pathname.split('/').pop() || 'Video', mime, kind: 'video', temporary: false }];
      setQueue(queueRef.current);
      busyState(false);
      await playRef.current(next);
    } catch (e) { if (live.current) setError(detail(e)); }
    finally { busyState(false); }
  };

  const button = (label: string, action: () => void, primary = false, disabled = false) => (
    <Pressable onPress={action} disabled={disabled || busy} style={[styles.button, {
      backgroundColor: primary ? colors.primary : colors.secondary,
      opacity: disabled || busy ? 0.45 : 1,
    }]} accessibilityRole="button">
      <Text style={[styles.buttonText, { color: primary ? colors.primaryForeground : colors.foreground }]}>{label}</Text>
    </Pressable>
  );
  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]} testID="direct-cast-panel">
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.row}>
          <Feather name="cast" size={28} color={colors.primary} />
          <Text style={[styles.brand, { color: colors.primary }]}>framecast</Text>
          <Pressable onPress={() => void close()} accessibilityLabel="Disconnect and return to TV scan">
            <Feather name="x" size={28} color={colors.primary} />
          </Pressable>
        </View>
        <Text style={[styles.title, { color: colors.foreground }]}>{target.name}</Text>
        <Text style={[styles.text, { color: colors.mutedForeground }]}>
          {target.protocol === 'googlecast' ? 'Google Cast' : 'DLNA media receiver'} · {connected ? 'Receiver connected' : busy ? 'Connecting…' : 'Not connected'}
        </Text>
        <View style={[styles.notice, { backgroundColor: colors.secondary }]}>
          {busy && <ActivityIndicator color={colors.primary} />}
          <Text style={[styles.text, { color: colors.foreground }]} accessibilityLiveRegion="polite">{message}</Text>
        </View>
        {!!error && <Text style={[styles.text, { color: colors.foreground }]} accessibilityLiveRegion="assertive">{error}</Text>}
        {connected && <>
          <Text style={[styles.text, { color: colors.mutedForeground }]}>Media goes directly from your phone or original source to this receiver. No TV browser code is needed. The receiver decides which formats it can play.</Text>
          <View style={styles.row}>
            {button('Photos', () => void choose('image'), false)}
            {button('Videos', () => void choose('video'), true)}
          </View>
          <TextInput value={url} onChangeText={setUrl} autoCapitalize="none" autoCorrect={false}
            placeholder="Direct MP4 or M3U8 video link" placeholderTextColor={colors.mutedForeground}
            style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} />
          {button('Play video link', () => void playUrl(), true, !url.trim())}
          <Text style={[styles.text, { color: colors.mutedForeground }]}>Webpages, YouTube share links and protected streams cannot be played through this direct-link control. Use browser pairing for supported webpage players. Screen mirroring also uses browser pairing.</Text>
          {index >= 0 && <>
            {queue[index]?.kind === 'image' && <Image source={{ uri: queue[index].uri }} style={styles.preview} resizeMode="contain" />}
            <Text style={[styles.name, { color: colors.foreground }]}>{queue[index]?.name}</Text>
            {queue[index]?.kind === 'video' && <>
              <Text style={[styles.text, { color: colors.mutedForeground }]}>{time(status.position)} / {time(status.duration)}</Text>
              <View style={styles.row}>
                {button('−10 sec', () => control('back10'))}
                {button(status.state === 'PLAYING' ? 'Pause' : 'Play', () => control('toggle'), true)}
                {button('+10 sec', () => control('forward10'))}
              </View>
            </>}
          </>}
          {queue.map((item, i) => <Pressable key={`${item.uri}:${i}`} disabled={busy} onPress={() => void playRef.current(i)}
            style={[styles.queueItem, { borderColor: i === index ? colors.primary : colors.border }]}>
            <Text style={[styles.text, { color: colors.foreground }]}>{i + 1}. {item.name}{i === index ? ' · Selected' : ''}</Text>
          </Pressable>)}
          {queue.length > 1 && <View style={styles.row}>
            {button('Previous', () => control('previous'), false, index <= 0)}
            {button('Next', () => control('next'), false, index >= queue.length - 1)}
          </View>}
          {!isPremium && button('Get Premium · background casting', openPaywall, true)}
          {!isPremium && !subscriptionLoading && <CastingBannerAd backgroundColor={colors.background} borderColor={colors.border} />}
        </>}
        <Pressable onPress={() => void close()} style={[styles.button, { backgroundColor: colors.primary }]}>
          <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>Disconnect · return to scan</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 }, content: { padding: 24, gap: 18, paddingBottom: 40 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  brand: { flex: 1, fontSize: 24, fontFamily: 'Inter_700Bold' },
  title: { fontSize: 30, fontFamily: 'Inter_700Bold' },
  text: { fontSize: 15, lineHeight: 22, flexShrink: 1 },
  name: { fontSize: 18, fontFamily: 'Inter_600SemiBold' },
  notice: { borderRadius: 18, padding: 20, gap: 12 },
  button: { borderRadius: 18, padding: 16, alignItems: 'center', flexShrink: 1 },
  buttonText: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  input: { borderWidth: 1, borderRadius: 16, padding: 16, fontSize: 15 },
  preview: { height: 210, width: '100%' },
  queueItem: { borderWidth: 1, borderRadius: 14, padding: 14 },
});
