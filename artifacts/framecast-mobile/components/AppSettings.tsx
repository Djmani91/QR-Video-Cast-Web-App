import { useRef, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';

type Props = { onClearLocalData: () => Promise<void>; clearDisabled?: boolean };
type Phase = 'idle' | 'confirm' | 'busy' | 'success' | 'error';

const HOW = [
  'Connect your phone and TV to the same Wi-Fi network.',
  'Open FrameCast in the TV browser, then scan its QR code or enter its pairing code.',
  'Choose URL, Videos or Images to pick what to show.',
  'Use this phone to play, pause, skip and control the TV.',
  'Keep the app open while casting, or use supported Android background casting.',
];

const PRIVACY = [
  'Photos and videos from your phone are not uploaded to or stored on our servers.',
  'Pairing uses temporary signals only to connect your phone and TV.',
  'FrameCast may make temporary copies on this device to stream media.',
  'Website and video links are opened by the TV directly from the original website and follow that site\u2019s policies.',
];

export function AppSettings({ onClearLocalData, clearDisabled = false }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState('');
  const busyRef = useRef(false);
  const version = Constants.expoConfig?.version;

  const close = () => {
    if (busyRef.current) return;
    setOpen(false);
    setPhase('idle');
    setError('');
  };

  const confirm = async () => {
    if (busyRef.current || clearDisabled) return;
    busyRef.current = true;
    setPhase('busy');
    setError('');
    try {
      await onClearLocalData();
      setPhase('success');
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'Could not clear local data. Please try again.');
      setPhase('error');
    } finally {
      busyRef.current = false;
    }
  };

  const busy = phase === 'busy';

  const Bullet = ({ text, n }: { text: string; n?: number }) => (
    <View style={styles.row}>
      {n != null ? (
        <View style={[styles.num, { backgroundColor: colors.secondary }]}>
          <Text style={[styles.numText, { color: colors.primary }]}>{n}</Text>
        </View>
      ) : (
        <Ionicons name="shield-checkmark-outline" size={16} color={colors.primary} style={{ marginTop: 2 }} />
      )}
      <Text style={[styles.body, { color: colors.foreground }]}>{text}</Text>
    </View>
  );

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Open settings"
        testID="button-open-settings"
        style={({ pressed }) => [styles.iconBtn, { opacity: pressed ? 0.6 : 1 }]}
      >
        <Ionicons name="settings-outline" size={20} color={colors.mutedForeground} />
      </Pressable>

      <Modal visible={open} animationType="slide" transparent onRequestClose={close}>
        <View style={[styles.backdrop, { backgroundColor: 'rgba(10,14,12,0.45)' }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Dismiss settings" />
          <View style={[styles.sheet, { backgroundColor: colors.background, borderColor: colors.border, paddingBottom: Math.max(insets.bottom, Platform.OS === 'web' ? 34 : 16) }]}>
            <View style={[styles.grabber, { backgroundColor: colors.border }]} />
            <View style={styles.head}>
              <Text style={[styles.title, { color: colors.foreground }]} accessibilityRole="header">Settings</Text>
              <Pressable onPress={close} disabled={busy} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close settings" testID="button-close-settings" style={{ opacity: busy ? 0.4 : 1 }}>
                <Ionicons name="close" size={24} color={colors.foreground} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
              <Text style={[styles.kicker, { color: colors.primary }]}>HOW IT WORKS</Text>
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {HOW.map((t, i) => <Bullet key={i} n={i + 1} text={t} />)}
              </View>

              <Text style={[styles.kicker, { color: colors.primary }]}>PRIVACY & LOCAL DATA</Text>
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {PRIVACY.map((t, i) => <Bullet key={i} text={t} />)}

                <View style={[styles.divider, { backgroundColor: colors.border }]} />
                <Text style={[styles.subhead, { color: colors.foreground }]}>Clear local data</Text>
                <Text style={[styles.small, { color: colors.mutedForeground }]}>
                  Disconnects the current TV and clears the queue, selections, pasted link and FrameCast temporary copies. Your original photos and videos stay on your phone.
                </Text>

                {phase === 'confirm' || busy ? (
                  <View style={[styles.confirmBox, { borderColor: colors.destructive, backgroundColor: colors.muted }]} accessibilityLiveRegion="polite">
                    <Text style={[styles.subhead, { color: colors.foreground }]}>Clear local data now?</Text>
                    <Text style={[styles.small, { color: colors.mutedForeground }]}>The TV will disconnect. Originals on your phone are not deleted.</Text>
                    <View style={styles.btnRow}>
                      <Pressable onPress={() => setPhase('idle')} disabled={busy} accessibilityRole="button" accessibilityLabel="Cancel clearing local data" testID="button-cancel-clear-local-data"
                        style={({ pressed }) => [styles.btn, { borderColor: colors.border, backgroundColor: colors.card, opacity: busy ? 0.5 : pressed ? 0.7 : 1 }]}>
                        <Text style={[styles.btnText, { color: colors.foreground }]}>Cancel</Text>
                      </Pressable>
                      <Pressable onPress={confirm} disabled={busy || clearDisabled} accessibilityRole="button" accessibilityLabel="Confirm clear local data" accessibilityState={{ busy, disabled: busy || clearDisabled }} testID="button-confirm-clear-local-data"
                        style={({ pressed }) => [styles.btn, { borderColor: colors.destructive, backgroundColor: colors.destructive, opacity: pressed ? 0.8 : 1 }]}>
                        {busy ? <ActivityIndicator size="small" color={colors.destructiveForeground} /> : <Text style={[styles.btnText, { color: colors.destructiveForeground }]}>Clear</Text>}
                      </Pressable>
                    </View>
                    {busy && <Text style={[styles.small, { color: colors.mutedForeground }]} testID="text-clear-status">Clearing local data...</Text>}
                  </View>
                ) : (
                  <Pressable
                    onPress={() => { setError(''); setPhase('confirm'); }}
                    disabled={clearDisabled}
                    accessibilityRole="button"
                    accessibilityLabel="Clear local data"
                    accessibilityState={{ disabled: clearDisabled }}
                    testID="button-clear-local-data"
                    style={({ pressed }) => [styles.clearBtn, { borderColor: colors.destructive, opacity: clearDisabled ? 0.45 : pressed ? 0.7 : 1 }]}
                  >
                    <Ionicons name="trash-outline" size={17} color={colors.destructive} />
                    <Text style={[styles.btnText, { color: colors.destructive }]}>Clear local data</Text>
                  </Pressable>
                )}

                {clearDisabled && phase !== 'busy' && (
                  <Text style={[styles.small, { color: colors.mutedForeground }]} testID="text-clear-disabled">
                    Unavailable right now. Wait for the current action to finish, then try again.
                  </Text>
                )}
                {phase === 'success' && (
                  <View style={styles.row} accessibilityLiveRegion="polite">
                    <Ionicons name="checkmark-circle" size={16} color={colors.primary} />
                    <Text style={[styles.small, { color: colors.primary }]} testID="text-clear-success">Local data cleared. Originals on your phone were not touched.</Text>
                  </View>
                )}
                {phase === 'error' && (
                  <View style={styles.row} accessibilityLiveRegion="assertive">
                    <Ionicons name="alert-circle" size={16} color={colors.destructive} />
                    <Text style={[styles.small, { color: colors.destructive }]} testID="text-clear-error">{error}</Text>
                  </View>
                )}
              </View>

              <Text style={[styles.kicker, { color: colors.primary }]}>ABOUT</Text>
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.aboutRow}>
                  <Text style={[styles.subhead, { color: colors.foreground }]}>FrameCast</Text>
                  <Text style={[styles.small, { color: colors.mutedForeground }]} testID="text-app-version">
                    {version ? `Version ${version}` : 'Version unavailable'}
                  </Text>
                </View>
                <Text style={[styles.small, { color: colors.mutedForeground }]}>A private phone-to-TV companion for sharing your own family media.</Text>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  sheet: { maxHeight: '90%', borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, paddingHorizontal: 20, paddingTop: 8 },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, marginBottom: 8 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 22, letterSpacing: -0.4 },
  content: { paddingBottom: 12, gap: 10 },
  kicker: { fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 1.2, marginTop: 10 },
  card: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 10 },
  row: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  num: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  numText: { fontFamily: 'Inter_700Bold', fontSize: 12 },
  body: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 20 },
  subhead: { fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  small: { flexShrink: 1, fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 18 },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 4 },
  clearBtn: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', minHeight: 46, borderRadius: 12, borderWidth: 1 },
  confirmBox: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 8 },
  btnRow: { flexDirection: 'row', gap: 8 },
  btn: { flex: 1, minHeight: 44, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  aboutRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
