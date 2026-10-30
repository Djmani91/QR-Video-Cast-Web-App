import { useEffect, useState, type ComponentProps } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';

type IconName = ComponentProps<typeof Ionicons>['name'];
type TutorialColors = ReturnType<typeof useColors>;

type TutorialStep = {
  title: string;
  description: string;
  icon: IconName;
};

const STEPS: TutorialStep[] = [
  {
    title: 'Use the same Wi-Fi',
    description: 'Put your phone and TV on the same home Wi-Fi network. Guest Wi-Fi, a VPN, or router isolation can stop the devices from connecting directly.',
    icon: 'wifi-outline',
  },
  {
    title: 'Open FrameCast on your TV',
    description: 'On the TV, open its Internet or browser app. Type this address in the TV address bar, then leave the FrameCast page open.',
    icon: 'tv-outline',
  },
  {
    title: 'Pair your phone',
    description: 'Tap Scan TV code and point your camera at the QR code on the TV. Or enter the five-digit code shown beside it.',
    icon: 'scan-outline',
  },
  {
    title: 'Choose what to play',
    description: 'Select Images or Videos to show media on the TV. For a link, use URL and tap Play on TV. On Android, Mirror shares your screen after you approve the system prompt.',
    icon: 'albums-outline',
  },
  {
    title: 'Control playback and finish',
    description: 'Pause, seek, and adjust volume from your phone. Fit whole video keeps the full picture visible; Full screen on TV enlarges the view. Tap Disconnect from this TV when finished.',
    icon: 'game-controller-outline',
  },
];

function StepArtwork({
  index,
  tvAddress,
  colors,
}: {
  index: number;
  tvAddress: string;
  colors: TutorialColors;
}) {
  if (index === 0) {
    return (
      <View style={styles.artworkContent} testID="tutorial-artwork-wifi">
        <View style={styles.deviceDiagram}>
          <View style={[styles.deviceIcon, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <Ionicons name="phone-portrait-outline" size={28} color={colors.primary} />
            <Text style={[styles.deviceLabel, { color: colors.mutedForeground }]}>PHONE</Text>
          </View>
          <View style={styles.networkLink}>
            <Ionicons name="wifi-outline" size={31} color={colors.primary} />
            <View style={[styles.networkLine, { backgroundColor: colors.border }]} />
            <Text style={[styles.networkLabel, { color: colors.mutedForeground }]}>SAME WI-FI</Text>
          </View>
          <View style={[styles.deviceIcon, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <Ionicons name="tv-outline" size={29} color={colors.primary} />
            <Text style={[styles.deviceLabel, { color: colors.mutedForeground }]}>TV</Text>
          </View>
        </View>
        <Text style={[styles.artworkCaption, { color: colors.mutedForeground }]}>Both devices need to be on the same home network.</Text>
      </View>
    );
  }

  if (index === 1) {
    return (
      <View style={styles.artworkContent} testID="tutorial-artwork-tv-address">
        <View style={[styles.addressCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <View style={[styles.addressIcon, { backgroundColor: colors.secondary }]}>
            <Ionicons name="globe-outline" size={24} color={colors.primary} />
          </View>
          <Text style={[styles.addressLabel, { color: colors.mutedForeground }]}>TYPE THIS ON THE TV</Text>
          <Text selectable style={[styles.addressText, { color: colors.foreground }]} accessibilityLabel={`TV browser address: ${tvAddress}`}>
            {tvAddress}
          </Text>
          <Text style={[styles.artworkCaption, { color: colors.mutedForeground }]}>Use the TV’s own Internet or browser app.</Text>
        </View>
      </View>
    );
  }

  if (index === 2) {
    return (
      <View style={styles.artworkContent} testID="tutorial-artwork-pair">
        <View style={[styles.scanCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <View style={[styles.scanIcon, { backgroundColor: colors.secondary }]}>
            <Ionicons name="scan-outline" size={43} color={colors.primary} />
          </View>
          <Text style={[styles.scanTitle, { color: colors.foreground }]}>Scan the TV’s QR code</Text>
          <View style={styles.orRow}>
            <View style={[styles.orLine, { backgroundColor: colors.border }]} />
            <Text style={[styles.orText, { color: colors.mutedForeground }]}>OR</Text>
            <View style={[styles.orLine, { backgroundColor: colors.border }]} />
          </View>
          <View style={[styles.codeHint, { backgroundColor: colors.secondary }]}>
            <Ionicons name="keypad-outline" size={19} color={colors.primary} />
            <Text style={[styles.codeHintText, { color: colors.foreground }]}>Enter the 5-digit TV code</Text>
          </View>
        </View>
      </View>
    );
  }

  if (index === 3) {
    const choices: { label: string; icon: IconName; tint: string }[] = [
      { label: 'Images', icon: 'images-outline', tint: colors.primary },
      { label: 'Videos', icon: 'videocam-outline', tint: colors.tabVideo },
      { label: 'URL', icon: 'link-outline', tint: colors.accent },
      { label: 'Mirror', icon: 'phone-portrait-outline', tint: colors.primary },
    ];

    return (
      <View style={styles.artworkContent} testID="tutorial-artwork-media">
        <View style={styles.choiceGrid}>
          {choices.map((choice) => (
            <View key={choice.label} style={[styles.choiceCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <Ionicons name={choice.icon} size={23} color={choice.tint} />
              <Text style={[styles.choiceLabel, { color: colors.foreground }]}>{choice.label}</Text>
            </View>
          ))}
        </View>
        <Text style={[styles.artworkCaption, { color: colors.mutedForeground }]}>Select phone media, paste a link, or mirror your Android screen.</Text>
      </View>
    );
  }

  return (
    <View style={styles.artworkContent} testID="tutorial-artwork-controls">
      <View style={[styles.controlsCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
        <View style={styles.controlIcons}>
          <Ionicons name="play-skip-back-outline" size={21} color={colors.mutedForeground} />
          <View style={[styles.playIcon, { backgroundColor: colors.primary }]}>
            <Ionicons name="play" size={20} color={colors.primaryForeground} />
          </View>
          <Ionicons name="play-skip-forward-outline" size={21} color={colors.mutedForeground} />
        </View>
        <View style={styles.fitOptions}>
          <View style={[styles.fitOption, { backgroundColor: colors.secondary }]}>
            <Ionicons name="resize-outline" size={16} color={colors.primary} />
            <Text style={[styles.fitLabel, { color: colors.foreground }]}>Fit whole video</Text>
          </View>
          <View style={[styles.fitOption, { backgroundColor: colors.secondary }]}>
            <Ionicons name="scan-outline" size={16} color={colors.primary} />
            <Text style={[styles.fitLabel, { color: colors.foreground }]}>Full screen</Text>
          </View>
        </View>
        <View style={[styles.disconnectHint, { backgroundColor: colors.destructive }]}>
          <Ionicons name="unlink-outline" size={17} color={colors.destructiveForeground} />
          <Text style={[styles.disconnectText, { color: colors.destructiveForeground }]}>Disconnect from this TV</Text>
        </View>
      </View>
    </View>
  );
}

export function SetupTutorial({
  visible,
  tvAddress,
  onDismiss,
}: {
  visible: boolean;
  tvAddress: string;
  onDismiss: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(0);
  const step = STEPS[index];
  const isLastStep = index === STEPS.length - 1;

  useEffect(() => {
    if (visible) setIndex(0);
  }, [visible]);

  const advance = () => {
    if (isLastStep) {
      onDismiss();
      return;
    }
    setIndex((current) => Math.min(current + 1, STEPS.length - 1));
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      presentationStyle="fullScreen"
      onRequestClose={onDismiss}
      testID="modal-setup-tutorial"
    >
      <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
        <View style={styles.topBar}>
          <Text style={[styles.topTitle, { color: colors.mutedForeground }]}>FRAMECAST GUIDE</Text>
          <Text style={[styles.stepCount, { color: colors.mutedForeground }]} accessibilityLabel={`Step ${index + 1} of ${STEPS.length}`}>
            {String(index + 1).padStart(2, '0')} / {String(STEPS.length).padStart(2, '0')}
          </Text>
          <Pressable
            onPress={onDismiss}
            accessibilityRole="button"
            accessibilityLabel="Skip setup tutorial"
            testID="button-skip-setup-tutorial"
            hitSlop={10}
            style={({ pressed }) => [styles.closeButton, { backgroundColor: colors.secondary, opacity: pressed ? 0.65 : 1 }]}
          >
            <Ionicons name="close" size={20} color={colors.foreground} />
          </Pressable>
        </View>

        <View style={styles.progressTrack} accessibilityLabel={`Tutorial step ${index + 1} of ${STEPS.length}`}>
          {STEPS.map((_, stepIndex) => (
            <View
              key={stepIndex}
              style={[styles.progressSegment, { backgroundColor: stepIndex <= index ? colors.primary : colors.border }]}
            />
          ))}
        </View>

        <ScrollView
          key={index}
          style={styles.pageScroll}
          contentContainerStyle={styles.page}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.stepIconWrap, { backgroundColor: colors.secondary }]}>
            <Ionicons name={step.icon} size={25} color={colors.primary} />
          </View>
          <Text style={[styles.title, { color: colors.foreground }]} accessibilityRole="header">{step.title}</Text>
          <Text style={[styles.description, { color: colors.mutedForeground }]}>{step.description}</Text>
          <View style={[styles.artboard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <StepArtwork index={index} tvAddress={tvAddress} colors={colors} />
          </View>
        </ScrollView>

        <View style={[styles.footer, { borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 18) }]}>
          <View style={styles.footerActions}>
            {index > 0 ? (
              <Pressable
                onPress={() => setIndex((current) => Math.max(0, current - 1))}
                accessibilityRole="button"
                accessibilityLabel="Previous tutorial step"
                testID="button-tutorial-back"
                style={({ pressed }) => [styles.backButton, { borderColor: colors.border, opacity: pressed ? 0.65 : 1 }]}
              >
                <Ionicons name="arrow-back" size={18} color={colors.foreground} />
                <Text style={[styles.backText, { color: colors.foreground }]}>Back</Text>
              </Pressable>
            ) : <View style={styles.backButtonPlaceholder} />}
            <Pressable
              onPress={advance}
              accessibilityRole="button"
              accessibilityLabel={isLastStep ? 'Finish setup tutorial' : 'Next tutorial step'}
              testID={isLastStep ? 'button-tutorial-finish' : 'button-tutorial-next'}
              style={({ pressed }) => [styles.nextButton, { backgroundColor: colors.primary, opacity: pressed ? 0.82 : 1 }]}
            >
              <Text style={[styles.nextText, { color: colors.primaryForeground }]}>{isLastStep ? 'Start connecting' : 'Continue'}</Text>
              <Ionicons name={isLastStep ? 'checkmark' : 'arrow-forward'} size={18} color={colors.primaryForeground} />
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 22, paddingTop: 8, paddingBottom: 14 },
  topTitle: { flex: 1, fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 1.5 },
  stepCount: { fontFamily: 'Inter_600SemiBold', fontSize: 12, marginRight: 12 },
  closeButton: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  progressTrack: { flexDirection: 'row', gap: 6, paddingHorizontal: 22, marginBottom: 4 },
  progressSegment: { flex: 1, height: 4, borderRadius: 2 },
  pageScroll: { flex: 1 },
  page: { flexGrow: 1, paddingHorizontal: 22, paddingTop: 24, paddingBottom: 22 },
  stepIconWrap: { width: 50, height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 30, lineHeight: 36, letterSpacing: -0.8 },
  description: { fontFamily: 'Inter_400Regular', fontSize: 15, lineHeight: 23, marginTop: 10 },
  artboard: { minHeight: 230, borderRadius: 22, borderWidth: 1, marginTop: 24, padding: 16, justifyContent: 'center' },
  artworkContent: { flex: 1, justifyContent: 'center', gap: 18 },
  deviceDiagram: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  deviceIcon: { width: 76, height: 82, borderWidth: 1, borderRadius: 18, alignItems: 'center', justifyContent: 'center', gap: 5 },
  deviceLabel: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 1 },
  networkLink: { width: 90, alignItems: 'center', justifyContent: 'center', gap: 5 },
  networkLine: { width: 54, height: 2 },
  networkLabel: { fontFamily: 'Inter_700Bold', fontSize: 8, letterSpacing: 0.7 },
  artworkCaption: { fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18, textAlign: 'center' },
  addressCard: { alignItems: 'center', borderWidth: 1, borderRadius: 18, paddingHorizontal: 13, paddingVertical: 16, gap: 10 },
  addressIcon: { width: 48, height: 48, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  addressLabel: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 1 },
  addressText: { fontFamily: 'Inter_600SemiBold', fontSize: 24, lineHeight: 30, textAlign: 'center' },
  scanCard: { alignItems: 'center', borderWidth: 1, borderRadius: 18, paddingHorizontal: 16, paddingVertical: 14, gap: 9 },
  scanIcon: { width: 76, height: 76, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  scanTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  orRow: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 3 },
  orLine: { flex: 1, height: 1 },
  orText: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 1 },
  codeHint: { width: '100%', minHeight: 42, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 10 },
  codeHintText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  choiceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
  choiceCard: { width: '47%', minHeight: 72, borderWidth: 1, borderRadius: 15, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12 },
  choiceLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  controlsCard: { borderWidth: 1, borderRadius: 18, padding: 15, gap: 15 },
  controlIcons: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 28 },
  playIcon: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  fitOptions: { flexDirection: 'row', gap: 8 },
  fitOption: { flex: 1, minHeight: 42, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 6 },
  fitLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 10 },
  disconnectHint: { minHeight: 43, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  disconnectText: { fontFamily: 'Inter_700Bold', fontSize: 12 },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 22, paddingTop: 14 },
  footerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  backButton: { minHeight: 52, minWidth: 92, borderWidth: 1, borderRadius: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 12 },
  backButtonPlaceholder: { minWidth: 0, flex: 0 },
  backText: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  nextButton: { minHeight: 52, flex: 1, borderRadius: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, paddingHorizontal: 16 },
  nextText: { fontFamily: 'Inter_700Bold', fontSize: 15 },
});
