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
import { onBackgroundControl, startBackgroundCasting, stopBackgroundCasting, updateBackgroundCasting } from '@/lib/background-casting';
import { MAX_MEDIA_SELECTION_ITEMS } from '@/lib/media-selection';
import { formatFreeCastingTrialTime, useFreeCastingTrial } from '@/lib/free-casting-trial';

type Item = { uri: string; name: string; mime: string; kind: 'image' | 'video'; temporary: boolean };
type Props = { target: DirectTarget; onClose(): void };
const emptyStatus: DirectStatus = { state: 'READY', position: 0, duration: 0 };
const detail = (error: unknown) => error instanceof Error ? error.message : String(error);
const time = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

/** Direct receivers are deliberately separate from browser rooms and WebRTC signaling. */
export default function DirectCastPanel({ target, onClose }: Props) {
  const colors = useColors();
  const { isPremium, loading: subscriptionLoading } = useSubscription();
  const { openPaywall, openExpiredTrialPaywall, openFirstPairChoice, firstPairChoicePending } = useSubscriptionChoiceGate();
  const trial = useFreeCastingTrial();
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
  const connectedRef = useRef(false);
  const queueRef = useRef<Item[]>([]);
  const indexRef = useRef(-1);
  const countRef = useRef({ image: 0, video: 0 });
  const temporaryFiles = useRef(new Set<string>());
  const playedRef = useRef(false);
  const pausedForBackground = useRef(false);
  const statusRef = useRef(emptyStatus);
  const playRef = useRef<(i: number) => Promise<void>>(async () => undefined);
  const controlRef = useRef<(action: string) => void>(() => undefined);
  const operations = useRef(Promise.resolve());
  premiumRef.current = isPremium;
  loadingRef.current = subscriptionLoading;

  useEffect(() => {
    trial.setSessionConnected(
      connected && !firstPairChoicePending && !subscriptionLoading,
      isPremium || subscriptionLoading,
    );
  }, [connected, firstPairChoicePending, isPremium, subscriptionLoading, trial.setSessionConnected]);

  useEffect(() => () => trial.setSessionConnected(false, premiumRef.current), [trial.setSessionConnected]);

  useEffect(() => {
    if (!connected || isPremium || !trial.expired) return;
    void ordered(() => controlDirect('pause')).catch(() => undefined);
    setMessage('Your 30 minutes of ad-supported casting are used. Get Premium to keep casting.');
    openExpiredTrialPaywall();
  }, [connected, isPremium, openExpiredTrialPaywall, trial.expired]);

  // Keep playback commands ordered, but let disconnect interrupt a stalled command.
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
    try { await cleanup(); }
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
        setMessage(target.protocol === 'dlna'
          ? 'DLNA media-only receiver ready. Choose a photo or video to play.'
          : 'Media-only receiver ready. Choose a photo or video to play.');
        openFirstPairChoice();
      } catch (e) {
        if (live.current) { setError(detail(e)); setMessage('Could not connect to the receiver.'); }
      } finally { busyState(false); }
    });
    return () => {
      live.current = false;
      connectedRef.current = false;
      void cleanup().catch(() => undefined);
    };
  }, []); // A selected target owns this panel for its lifetime.

  const play = async (nextIndex: number) => {
    if (!connectedRef.current || busyRef.current || !queueRef.current[nextIndex]) return;
    if (!premiumRef.current && !trial.available) {
      openExpiredTrialPaywall();
      return;
    }
    busyState(true);
    setError('');
    setMessage('Opening your media on the TV…');
    playedRef.current = false;
    try {
      await ordered(async () => {
        const item = queueRef.current[nextIndex];
        if (!live.current || closingRef.current || !item) return;
        // End the previous read before replacing the selected-file server.
        if (indexRef.current >= 0) await controlDirect('stop');
        let source = item.uri;
        if (!/^https?:\/\//i.test(source)) {
          const stream = await startLocalStream(item.uri, item.name, target.protocol === 'googlecast');
          source = stream.receiverUrl.replace(/receiver\.html$/, `media${stream.extension}`);
        } else await stopLocalStream();
        if (!live.current || closingRef.current) return;
        await loadDirect(source, item.mime, item.name);
        if (!live.current || closingRef.current) return;
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
      if (live.current && !closingRef.current) {
        const code = e && typeof e === 'object' && 'code' in e ? e.code : undefined;
        if (code === 'CAST_LOAD_TIMEOUT') {
          connectedRef.current = false;
          setConnected(false);
          setMessage('The TV did not confirm playback. Disconnect and reconnect before trying again.');
          void Promise.allSettled([disconnectDirect(), stopLocalStream()]);
        } else setMessage('The TV could not open this media.');
        setError(detail(e));
      }
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
    if (!premiumRef.current && !trial.available && action !== 'disconnect' && action !== 'pause') {
      openExpiredTrialPaywall();
      return;
    }
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
      if (state !== 'background' || premiumRef.current) return;
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
    if (subscriptionLoading || isPremium || !connected || AppState.currentState !== 'background') return;
    pausedForBackground.current = true;
    playedRef.current = false;
    void ordered(() => controlDirect('stop')).catch(e => {
      if (live.current) setError(detail(e));
    });
  }, [isPremium, subscriptionLoading, connected]);

  const allowance = async (kind: 'image' | 'video') => {
    if (loadingRef.current) throw new Error('Please wait while your Premium status is checked.');
    if (trial.error) throw new Error(trial.error);
    const count = countRef.current[kind];
    if (!premiumRef.current && !trial.available) {
      openExpiredTrialPaywall();
      return 0;
    }
    const slots = Math.max(0, MAX_MEDIA_SELECTION_ITEMS - count);
    if (slots === 0) setError(`You can choose up to ${MAX_MEDIA_SELECTION_ITEMS} ${kind === 'image' ? 'photos' : 'videos'} in this TV session.`);
    return slots;
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
          {target.protocol === 'googlecast' ? 'Google Cast' : 'DLNA media receiver'} · {connected ? 'Media-only ready' : busy ? 'Preparing media receiver…' : 'Not connected'}
        </Text>
        <View style={[styles.notice, { backgroundColor: colors.secondary }]}>
          <View style={styles.noticeRow}>
            <View style={styles.progressSlot}>
              <ActivityIndicator animating={busy} color={colors.primary} />
            </View>
            <Text style={[styles.text, styles.noticeText, { color: colors.foreground }]} accessibilityLiveRegion="polite">{message}</Text>
            <Pressable
              onPress={() => void close()}
              disabled={!busy}
              testID="direct-cast-cancel"
              accessibilityRole="button"
              accessibilityLabel="Cancel and disconnect from TV"
              style={[styles.cancelButton, { opacity: busy ? 1 : 0 }]}
            >
              <Text style={[styles.cancelText, { color: colors.primary }]}>Cancel</Text>
            </Pressable>
          </View>
        </View>
        {connected && !isPremium && trial.hasStarted && trial.remainingMs > 0 ? (
          <View style={[styles.trialNotice, { backgroundColor: colors.secondary, borderColor: colors.border }]} testID="direct-free-trial-countdown">
            <Feather name="clock" size={17} color={colors.primary} />
            <Text style={[styles.text, { color: colors.foreground }]}>
              Ad-supported access · {formatFreeCastingTrialTime(trial.remainingMs)} left. Time counts while connected and FrameCast is open.
            </Text>
          </View>
        ) : null}
        {trial.error && !isPremium ? <Text style={[styles.text, { color: colors.foreground }]} accessibilityRole="alert">{trial.error}</Text> : null}
        {!!error && <Text style={[styles.text, { color: colors.foreground }]} accessibilityLiveRegion="assertive">{error}</Text>}
        {connected && <>
        <Text style={[styles.text, { color: colors.mutedForeground }]}>
          {target.protocol === 'dlna'
            ? 'FrameCast sends media to the TV’s DLNA player only. It does not control the TV home screen or open its browser. The TV may stay on its current screen until playback starts.'
            : 'FrameCast sends selected media to this receiver only. It does not control the TV home screen or open its browser. No TV browser code is needed for this media-only route.'}
        </Text>
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
  trialNotice: { borderWidth: 1, borderRadius: 15, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 9 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  brand: { flex: 1, fontSize: 24, fontFamily: 'Inter_700Bold' },
  title: { fontSize: 30, fontFamily: 'Inter_700Bold' },
  text: { fontSize: 15, lineHeight: 22, flexShrink: 1 },
  name: { fontSize: 18, fontFamily: 'Inter_600SemiBold' },
  notice: { borderRadius: 18, padding: 16, minHeight: 76, justifyContent: 'center' },
  noticeRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  progressSlot: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  noticeText: { flex: 1 },
  cancelButton: { minWidth: 48, alignItems: 'flex-end', paddingVertical: 8 },
  cancelText: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  button: { borderRadius: 18, padding: 16, alignItems: 'center', flexShrink: 1 },
  buttonText: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  input: { borderWidth: 1, borderRadius: 16, padding: 16, fontSize: 15 },
  preview: { height: 210, width: '100%' },
  queueItem: { borderWidth: 1, borderRadius: 14, padding: 14 },
});
