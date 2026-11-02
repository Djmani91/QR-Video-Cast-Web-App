import { Feather } from '@expo/vector-icons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { useColors } from '@/hooks/useColors';
import {
  connectSamsungTv,
  discoverNearbyTvs,
  nearbyDiscoveryAvailable,
  type NearbyTv,
} from '@/lib/tv-discovery';

export interface NearbyTvsProps {
  onPaired: (roomId: string) => void;
  scanRequest?: number;
}

type ScanState = 'idle' | 'scanning' | 'done' | 'error';

const FALLBACK = 'You can always open 2tx1.com in the TV browser and enter its code here instead.';

const TYPE_LABEL: Record<NearbyTv['type'], string> = {
  samsung: 'Samsung TV',
  chromecast: 'Chromecast / Google TV',
  firetv: 'Fire TV',
  webos: 'LG webOS TV',
  roku: 'Roku TV / player',
  dlna: 'Smart TV · DLNA',
  appletv: 'Apple TV',
};

const LIMITATION: Record<Exclude<NearbyTv['type'], 'samsung'>, string> = {
  chromecast:
    'Detected only. FrameCast cannot connect to this TV yet. Chromecast needs a registered Cast receiver app and cannot open the normal 2tx1.com website. Use the code on another screen with a browser instead.',
  firetv:
    'Detected only. FrameCast cannot connect to this TV automatically. Open the Silk browser on the Fire TV, go to 2tx1.com, then enter its code here. Automatic connection would need a Matter receiver, which is not supported yet.',
  webos:
    'Found your LG TV. Open its Web Browser, type 2tx1.com, then enter its code here. Automatic browser control for LG needs a separate approved webOS pairing connection; it is not enabled yet.',
  roku:
    'Found your Roku TV or player. Roku does not provide a general TV web browser. Connecting from FrameCast would require a Roku receiver channel, which is not included yet. Use a different screen with a browser for code pairing.',
  dlna:
    'Found a smart TV using its media-discovery service. If it has an Internet browser, open 2tx1.com there and enter its code here. Finding the TV alone does not enable direct DLNA playback or automatic browser control.',
  appletv:
    'Found your Apple TV through its AirPlay advertisement. FrameCast Android does not include an AirPlay sender or Apple TV receiver app, and Apple TV has no built-in general web browser. Use another screen with a browser for code pairing.',
};

const tvKey = (tv: NearbyTv) => `${tv.type}-${tv.ip}`;

function errMsg(e: unknown, fallback: string) {
  return e instanceof Error && e.message ? e.message : fallback;
}

export default function NearbyTvs({ onPaired, scanRequest = 0 }: NearbyTvsProps) {
  const supported = Platform.OS === 'android' && nearbyDiscoveryAvailable && typeof discoverNearbyTvs === 'function';
  if (!supported) return null;
  return <NearbyTvsInner onPaired={onPaired} scanRequest={scanRequest} />;
}

function NearbyTvsInner({ onPaired, scanRequest = 0 }: NearbyTvsProps) {
  const colors = useColors();
  const [scan, setScan] = useState<ScanState>('idle');
  const [scanError, setScanError] = useState<string | null>(null);
  const [tvs, setTvs] = useState<NearbyTv[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [settling, setSettling] = useState(false);
  const [progress, setProgress] = useState<string>('');
  const [connectError, setConnectError] = useState<string | null>(null);

  const mounted = useRef(true);
  const scanToken = useRef(0);
  const scanPromise = useRef<Promise<NearbyTv[]> | null>(null);
  const connectBusy = useRef(false); // true until native promise settles
  const abortRef = useRef<AbortController | null>(null);
  const onPairedRef = useRef(onPaired);
  onPairedRef.current = onPaired;

  const runScan = useCallback(async () => {
    if (connectBusy.current) return;
    const token = ++scanToken.current;
    setScan('scanning');
    setScanError(null);
    // Only one native scan in flight; a re-run (e.g. StrictMode remount) attaches to it.
    if (!scanPromise.current) {
      const p = discoverNearbyTvs();
      scanPromise.current = p;
      const clear = () => {
        if (scanPromise.current === p) scanPromise.current = null;
      };
      p.then(clear, clear);
    }
    try {
      const found = await scanPromise.current;
      if (!mounted.current || token !== scanToken.current) return;
      setTvs(Array.isArray(found) ? found : []);
      setScan('done');
    } catch (e) {
      if (!mounted.current || token !== scanToken.current) return;
      setScanError(errMsg(e, 'Could not scan this Wi-Fi network.'));
      setScan('error');
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    runScan();
    return () => {
      mounted.current = false;
      scanToken.current++;
      abortRef.current?.abort();
    };
  }, [runScan]);

  useEffect(() => {
    if (scanRequest > 0) runScan();
  }, [runScan, scanRequest]);

  const startSamsung = useCallback(async (tv: NearbyTv) => {
    if (connectBusy.current || scanPromise.current) return;
    connectBusy.current = true;
    const controller = new AbortController();
    abortRef.current = controller;
    setConnecting(tvKey(tv));
    setSettling(false);
    setConnectError(null);
    setProgress('Opening FrameCast on the TV. If the TV asks, choose Allow for FrameCast with the TV remote.');
    try {
      const roomId = await connectSamsungTv(tv, {
        signal: controller.signal,
        onProgress: (m) => {
          if (mounted.current && !controller.signal.aborted) setProgress(m);
        },
      });
      if (!mounted.current || controller.signal.aborted) return;
      if (typeof roomId !== 'string' || !roomId) throw new Error('The TV did not confirm pairing.');
      setConnecting(null);
      onPairedRef.current(roomId);
    } catch (e) {
      if (!mounted.current || controller.signal.aborted) return;
      setConnecting(null);
      setConnectError(errMsg(e, 'The TV did not confirm the FrameCast page.'));
    } finally {
      connectBusy.current = false;
      if (abortRef.current === controller) abortRef.current = null;
      if (mounted.current) setSettling(false);
    }
  }, []);

  const cancel = useCallback(() => {
    const c = abortRef.current;
    if (!c) return;
    c.abort();
    setConnecting(null);
    setProgress('');
    // native request may still be settling; block a new launch until it does
    setSettling(connectBusy.current);
  }, []);

  const busy = connecting !== null || settling;
  const selectedTv = tvs.find((t) => tvKey(t) === selected) ?? null;

  return (
    <View
      style={[styles.wrap, { backgroundColor: colors.card, borderColor: colors.muted, borderRadius: colors.radius * 2 }]}
      testID="nearby-tvs"
    >
      <View style={styles.header}>
        <Feather name="wifi" size={16} color={colors.primary} />
        <Text style={[styles.title, { color: colors.foreground }]} accessibilityRole="header">
          TVs on this Wi-Fi
        </Text>
        <Pressable
          testID="nearby-tvs-rescan"
          accessibilityRole="button"
          accessibilityLabel="Scan again for nearby TVs"
          accessibilityState={{ disabled: scan === 'scanning' || busy }}
          disabled={scan === 'scanning' || busy}
          onPress={runScan}
          hitSlop={8}
          style={({ pressed }) => [
            styles.rescan,
            { borderColor: colors.primary, opacity: scan === 'scanning' || busy ? 0.4 : pressed ? 0.7 : 1 },
          ]}
        >
          <Feather name="refresh-cw" size={14} color={colors.primary} />
          <Text style={[styles.rescanText, { color: colors.primary }]}>Rescan</Text>
        </Pressable>
      </View>

      {scan === 'scanning' || scan === 'idle' ? (
        <View style={styles.state} accessibilityLiveRegion="polite" accessible accessibilityLabel="Looking for TVs on this Wi-Fi">
          <ActivityIndicator color={colors.primary} />
          <Text style={[styles.stateText, { color: colors.mutedForeground }]}>
            Looking for smart TVs and streaming players on this Wi-Fi. This takes a few seconds. {FALLBACK}
          </Text>
        </View>
      ) : scan === 'error' ? (
        <View style={styles.state} accessibilityLiveRegion="polite">
          <Feather name="alert-circle" size={18} color={colors.primary} />
          <Text style={[styles.stateText, { color: colors.mutedForeground }]}>
            {scanError} {FALLBACK}
          </Text>
        </View>
      ) : tvs.length === 0 ? (
        <View style={styles.state}>
          <Feather name="tv" size={18} color={colors.mutedForeground} />
          <Text style={[styles.stateText, { color: colors.mutedForeground }]}>
            No TVs replied to this scan. Keep the TV awake and check that both devices use your main Wi-Fi, not an isolated guest network. A VPN or router device-isolation setting can block discovery. This does not mean your TV cannot use FrameCast. {FALLBACK}
          </Text>
        </View>
      ) : (
        <View style={styles.list}>
          {tvs.map((tv) => {
            const key = tvKey(tv);
            const isSel = key === selected;
            const isConn = connecting === key;
            return (
              <Pressable
                key={key}
                testID={`nearby-tv-${key}`}
                accessibilityRole="button"
                accessibilityLabel={`${tv.name}, ${TYPE_LABEL[tv.type]}${tv.model ? `, ${tv.model}` : ''}`}
                accessibilityHint={tv.type === 'samsung' ? 'Starts opening FrameCast on this TV' : 'Shows why this TV cannot be connected automatically'}
                accessibilityState={{ selected: isSel, disabled: busy, busy: isConn }}
                disabled={busy}
                onPress={() => {
                  setSelected(key);
                  setConnectError(null);
                  if (tv.type === 'samsung') startSamsung(tv);
                }}
                style={({ pressed }) => [
                  styles.row,
                  {
                    borderColor: isSel ? colors.secondary : colors.muted,
                    backgroundColor: isSel ? colors.tabVideosSurface : 'transparent',
                    borderRadius: colors.radius * 1.5,
                    opacity: busy && !isConn ? 0.5 : pressed ? 0.75 : 1,
                  },
                ]}
              >
                <View style={[styles.icon, { backgroundColor: colors.primary }]}>
                  <Feather name="tv" size={16} color={colors.secondary} />
                </View>
                <View style={styles.rowText}>
                  <Text numberOfLines={1} style={[styles.name, { color: colors.foreground }]}>{tv.name}</Text>
                  <Text numberOfLines={1} style={[styles.meta, { color: colors.mutedForeground }]}>
                    {TYPE_LABEL[tv.type]}{tv.model ? ` · ${tv.model}` : ''}
                    {tv.type !== 'samsung' ? ' · detected only' : ''}
                  </Text>
                </View>
                {isConn ? <ActivityIndicator color={colors.primary} /> : <Feather name="chevron-right" size={18} color={colors.mutedForeground} />}
              </Pressable>
            );
          })}
        </View>
      )}

      {connecting ? (
        <View
          style={[styles.panel, { backgroundColor: colors.tabVideosSurface, borderRadius: colors.radius }]}
          accessibilityLiveRegion="polite"
        >
          <Text style={[styles.panelTitle, { color: colors.primary }]}>Waiting for the TV</Text>
          <Text style={[styles.panelText, { color: colors.primary }]}>{progress}</Text>
          <Text style={[styles.panelText, { color: colors.mutedForeground }]}>
            Pairing finishes only after the FrameCast page on the TV confirms. {FALLBACK}
          </Text>
          <Pressable
            testID="nearby-tvs-cancel"
            accessibilityRole="button"
            accessibilityLabel="Stop waiting for the TV"
            onPress={cancel}
            style={({ pressed }) => [styles.cancel, { borderColor: colors.primary, borderRadius: colors.radius, opacity: pressed ? 0.7 : 1 }]}
          >
            <Feather name="x" size={16} color={colors.primary} />
            <Text style={[styles.cancelText, { color: colors.primary }]}>Stop waiting</Text>
          </Pressable>
        </View>
      ) : settling ? (
        <View style={[styles.panel, { backgroundColor: colors.muted, borderRadius: colors.radius }]} accessibilityLiveRegion="polite">
          <Text style={[styles.panelText, { color: colors.mutedForeground }]}>
            Stopped. Finishing the previous TV request before another can start. {FALLBACK}
          </Text>
        </View>
      ) : connectError ? (
        <View style={[styles.panel, { backgroundColor: colors.muted, borderRadius: colors.radius }]} accessibilityLiveRegion="assertive">
          <Text style={[styles.panelTitle, { color: colors.foreground }]}>Not paired</Text>
          <Text style={[styles.panelText, { color: colors.mutedForeground }]}>
            {connectError} Tap the TV to try again, or {FALLBACK.charAt(0).toLowerCase() + FALLBACK.slice(1)}
          </Text>
        </View>
      ) : selectedTv && selectedTv.type !== 'samsung' ? (
        <View style={[styles.panel, { backgroundColor: colors.muted, borderRadius: colors.radius }]} accessibilityLiveRegion="polite">
          <Text style={[styles.panelTitle, { color: colors.foreground }]}>{TYPE_LABEL[selectedTv.type]} found</Text>
          <Text style={[styles.panelText, { color: colors.mutedForeground }]}>{LIMITATION[selectedTv.type]}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderWidth: 2, padding: 14, gap: 12, alignSelf: 'stretch' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, fontFamily: 'Inter_700Bold', fontSize: 16 },
  rescan: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 10, minHeight: 32 },
  rescanText: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  state: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  stateText: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 20 },
  list: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 2, padding: 10, minHeight: 56 },
  icon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1 },
  name: { fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  meta: { fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 2 },
  panel: { padding: 12, gap: 6 },
  panelTitle: { fontFamily: 'Inter_700Bold', fontSize: 14 },
  panelText: { fontFamily: 'Inter_500Medium', fontSize: 13, lineHeight: 19 },
  cancel: { marginTop: 6, minHeight: 44, borderWidth: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  cancelText: { fontFamily: 'Inter_700Bold', fontSize: 14 },
});
