import { Feather } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Easing,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useColors } from '@/hooks/useColors';

export interface CastingLoadingOverlayProps {
  visible: boolean;
  title: string;
  detail: string;
  onDisconnect: () => void;
}

export default function CastingLoadingOverlay({ visible, title, detail, onDisconnect }: CastingLoadingOverlayProps) {
  const colors = useColors();
  const [reduceMotion, setReduceMotion] = useState(false);
  const pulse = useRef(new Animated.Value(0)).current;
  const enter = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => mounted && setReduceMotion(v))
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  useEffect(() => {
    if (!visible) return;
    const useNative = Platform.OS !== 'web';
    if (reduceMotion) {
      enter.setValue(1);
      pulse.setValue(0);
      return;
    }
    enter.setValue(0);
    Animated.timing(enter, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: useNative }).start();
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.sin), useNativeDriver: useNative }),
        Animated.timing(pulse, { toValue: 0, duration: 1100, easing: Easing.inOut(Easing.sin), useNativeDriver: useNative }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [visible, reduceMotion, enter, pulse]);

  useEffect(() => {
    if (visible) AccessibilityInfo.announceForAccessibility?.(`${title}. ${detail}`);
  }, [visible, title, detail]);

  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0.15] });
  const cardScale = enter.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onDisconnect}
    >
      <View style={styles.backdrop}>
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.primary, opacity: 0.72 }]} />
        <Animated.View
          accessibilityViewIsModal
          style={[
            styles.card,
            {
              backgroundColor: colors.card,
              borderColor: colors.secondary,
              borderRadius: colors.radius * 3,
              opacity: enter,
              transform: [{ scale: cardScale }],
            },
          ]}
        >
          <View
            style={styles.spinnerWrap}
            accessible
            accessibilityRole="progressbar"
            accessibilityLiveRegion="polite"
            accessibilityState={{ busy: true }}
            accessibilityLabel={`${title}. ${detail}`}
          >
            <Animated.View
              style={[
                styles.ring,
                { backgroundColor: colors.secondary, opacity: ringOpacity, transform: [{ scale: ringScale }] },
              ]}
            />
            <View style={[styles.core, { backgroundColor: colors.primary }]}>
              <ActivityIndicator size="large" color={colors.secondary} />
            </View>
          </View>

          <View style={[styles.chip, { backgroundColor: colors.muted }]}>
            <Feather name="wifi" size={13} color={colors.primary} />
            <Text style={[styles.chipText, { color: colors.primary }]}>WORKING OVER WI-FI</Text>
          </View>

          <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
          <Text style={[styles.detail, { color: colors.mutedForeground }]}>{detail}</Text>

          <View style={[styles.hint, { backgroundColor: colors.tabVideosSurface, borderRadius: colors.radius }]}>
            <Feather name="clock" size={16} color={colors.primary} />
            <Text style={[styles.hintText, { color: colors.primary }]}>
              Please wait. Tapping Play again will not make it faster and may restart the connection.
            </Text>
          </View>

          <Pressable
            testID="casting-loading-disconnect"
            accessibilityRole="button"
            accessibilityLabel="Disconnect and stop casting"
            accessibilityHint="Cancels opening the video on the TV"
            onPress={onDisconnect}
            style={({ pressed }) => [
              styles.button,
              { borderColor: colors.primary, borderRadius: colors.radius * 1.5, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Feather name="x-circle" size={18} color={colors.primary} />
            <Text style={[styles.buttonText, { color: colors.primary }]}>Disconnect</Text>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: {
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 24,
    borderWidth: 3,
  },
  spinnerWrap: { width: 120, height: 120, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  ring: { position: 'absolute', width: 120, height: 120, borderRadius: 60 },
  core: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, marginBottom: 14 },
  chipText: { fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 1.2 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 26, lineHeight: 32, letterSpacing: -0.8, textAlign: 'center' },
  detail: { fontFamily: 'Inter_400Regular', fontSize: 16, lineHeight: 23, textAlign: 'center', marginTop: 10 },
  hint: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 12, marginTop: 18, alignSelf: 'stretch' },
  hintText: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 14, lineHeight: 20 },
  button: {
    marginTop: 20,
    alignSelf: 'stretch',
    minHeight: 50,
    borderWidth: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  buttonText: { fontFamily: 'Inter_700Bold', fontSize: 16 },
});
