import { Feather } from '@expo/vector-icons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { useColors } from '@/hooks/useColors';
import { getDirectTarget, type DirectTarget } from '@/lib/direct-cast';
import {
  connectSamsungTv,
  discoverNearbyTvs,
  getNearbyTvAction,
  nearbyDiscoveryAvailable,
  type NearbyTv,
} from '@/lib/tv-discovery';

export interface NearbyTvsProps {
  onPaired: (roomId: string) => void;
  onDirectTarget?: (target: DirectTarget) => void;
  scanRequest?: number;
}

type ScanState = 'idle' | 'scanning' | 'done' | 'error';

const FALLBACK = 'For browser pairing, open 2tx1.com on the TV and enter the code shown there in this app.';

const BROWSER_GUIDANCE: Partial<Record<NearbyTv['type'], string>> = {
  samsung: 'Tap “Open browser on TV” to try the Samsung browser handoff. If it does not open, open Internet Browser on the TV, enter 2tx1.com, and type the TV code here.',
  firetv: 'On the Fire TV, open Silk Browser and enter 2tx1.com. The TV will show a short code; enter it here. FrameCast plays media in the browser and does not control the Fire TV home screen.',
  webos: 'On the LG TV, open its Internet Browser and enter 2tx1.com. Then type the code shown on the TV here.',
  dlna: 'If this TV has an Internet browser, open 2tx1.com and enter the code shown there. Otherwise, use the media-only option below if available.',
};

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
    'This Chromecast has no general TV browser. If media-only playback is offered below, use that. Otherwise, pair with a browser-equipped TV at 2tx1.com.',
  firetv:
    'Open Silk Browser on the Fire TV and type 2tx1.com. Pairing uses the code shown on the TV; scanning does not connect or control the Fire TV dashboard.',
  webos:
    'Open the LG TV’s Internet Browser, type 2tx1.com, then enter its code here. FrameCast does not control the TV home screen.',
  roku:
    'Roku does not provide a general TV web browser, and FrameCast does not include a Roku receiver channel. Use another browser-equipped TV for code pairing.',
  dlna:
    'Finding a DLNA device does not mean it is connected. If it has a browser, open 2tx1.com and enter the TV code here. Media-only playback is offered separately when supported.',
  appletv:
    'Apple TV has no general web browser, and FrameCast does not include an AirPlay receiver. Use another browser-equipped TV for code pairing.',
};

const tvKey = (tv: NearbyTv) => `${tv.type}-${tv.ip}`;

function errMsg(e: unknown, fallback: string) {
  return e instanceof Error && e.message ? e.message : fallback;
}

export default function NearbyTvs({ onPaired, onDirectTarget, scanRequest = 0 }: NearbyTvsProps) {
  const supported = Platform.OS === 'android' && nearbyDiscoveryAvailable && typeof discoverNearbyTvs === 'function';
  if (!supported) return null;
  return <NearbyTvsInner onPaired={onPaired} onDirectTarget={onDirectTarget} scanRequest={scanRequest} />;
}

function NearbyTvsInner({ onPaired, onDirectTarget, scanRequest = 0 }: NearbyTvsProps) {
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
  const selectedDirectTarget = selectedTv ? getDirectTarget(selectedTv) : null;
  const selectedAction = selectedTv
    ? getNearbyTvAction(selectedTv, Boolean(selectedDirectTarget && onDirectTarget))
    : null;

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
                accessibilityHint="Selects this TV and shows browser pairing or media-only options; scanning itself does not connect"
                accessibilityState={{ selected: isSel, disabled: busy, busy: isConn }}
                disabled={busy}
                onPress={() => {
                  setSelected(key);
                  setConnectError(null);
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
                    {tv.type === 'samsung'
                      ? ' · browser pairing'
                      : getDirectTarget(tv)
                        ? ' · media-only available'
                        : ' · found, not connected'}
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
      ) : selectedTv ? (
        <View
          style={[styles.panel, { backgroundColor: colors.muted, borderRadius: colors.radius }]}
          accessibilityLiveRegion="polite"
          testID="nearby-tv-selected"
        >
          <Text style={[styles.panelTitle, { color: colors.foreground }]}>{selectedTv.name}</Text>
          <Text style={[styles.panelText, { color: colors.mutedForeground }]}>
            {TYPE_LABEL[selectedTv.type]} found on Wi-Fi · not connected
          </Text>
          <Text style={[styles.panelText, { color: colors.mutedForeground }]}>
            {BROWSER_GUIDANCE[selectedTv.type] ?? LIMITATION[selectedTv.type as Exclude<NearbyTv['type'], 'samsung'>]}
          </Text>
          {BROWSER_GUIDANCE[selectedTv.type] ? (
            <View style={[styles.address, { backgroundColor: colors.secondary, borderRadius: colors.radius }]}>
              <Feather name="globe" size={16} color={colors.primary} />
              <View style={styles.addressText}>
                <Text style={[styles.addressLabel, { color: colors.primary }]}>TV browser address</Text>
                <Text selectable style={[styles.addressValue, { color: colors.primary }]}>2tx1.com</Text>
              </View>
            </View>
          ) : null}
          {selectedAction === 'samsung-browser' ? (
            <Pressable
              testID="nearby-tvs-open-samsung"
              accessibilityRole="button"
              accessibilityLabel="Open FrameCast in Samsung TV browser"
              disabled={busy}
              onPress={() => void startSamsung(selectedTv)}
              style={({ pressed }) => [
                styles.actionButton,
                { backgroundColor: colors.primary, borderRadius: colors.radius, opacity: busy ? 0.5 : pressed ? 0.75 : 1 },
              ]}
            >
              <Feather name="globe" size={17} color={colors.primaryForeground} />
              <Text style={[styles.actionButtonText, { color: colors.primaryForeground }]}>Open browser on TV</Text>
            </Pressable>
          ) : null}
          {selectedAction === 'direct-media' && selectedDirectTarget && onDirectTarget ? (
            <>
              <Text style={[styles.panelText, { color: colors.primary }]}>
                Media-only playback: FrameCast sends photos and videos to the receiver. It does not control the TV home screen.
              </Text>
              <Pressable
                testID="nearby-tvs-play-media"
                accessibilityRole="button"
                accessibilityLabel="Play media only on this TV"
                onPress={() => onDirectTarget(selectedDirectTarget)}
                style={({ pressed }) => [
                  styles.actionButton,
                  { backgroundColor: colors.primary, borderRadius: colors.radius, opacity: pressed ? 0.75 : 1 },
                ]}
              >
                <Feather name="play" size={17} color={colors.primaryForeground} />
                <Text style={[styles.actionButtonText, { color: colors.primaryForeground }]}>Play media only</Text>
              </Pressable>
            </>
          ) : null}
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
  address: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, marginTop: 4 },
  addressText: { flex: 1 },
  addressLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6 },
  addressValue: { fontFamily: 'Inter_700Bold', fontSize: 18, marginTop: 2 },
  actionButton: { minHeight: 46, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 6 },
  actionButtonText: { fontFamily: 'Inter_700Bold', fontSize: 14 },
  cancel: { marginTop: 6, minHeight: 44, borderWidth: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  cancelText: { fontFamily: 'Inter_700Bold', fontSize: 14 },
});
