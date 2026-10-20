import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';

export type CastTab = 'url' | 'videos' | 'images' | 'screen';

const TABS: { key: CastTab; label: string; icon: keyof typeof Ionicons.glyphMap; activeIcon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'url', label: 'URL', icon: 'link-outline', activeIcon: 'link' },
  { key: 'videos', label: 'Videos', icon: 'videocam-outline', activeIcon: 'videocam' },
  { key: 'images', label: 'Images', icon: 'images-outline', activeIcon: 'images' },
  { key: 'screen', label: 'Mirror', icon: 'phone-portrait-outline', activeIcon: 'phone-portrait' },
];

export function CastTabs({ value, onChange, showScreen = Platform.OS === 'android' }: { value: CastTab; onChange: (tab: CastTab) => void; showScreen?: boolean }) {
  const colors = useColors();
  const tabs = showScreen ? TABS : TABS.filter((tab) => tab.key !== 'screen');
  return (
    <View
      style={[styles.bar, { backgroundColor: colors.secondary, borderColor: colors.border }]}
      accessibilityRole="tablist"
      testID="cast-tabs"
    >
      {tabs.map((tab) => {
        const selected = tab.key === value;
        return (
          <Pressable
            key={tab.key}
            onPress={() => { if (!selected) onChange(tab.key); }}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={`${tab.label} tab`}
            hitSlop={4}
            style={({ pressed }) => [
              styles.tab,
              selected && [styles.tabSelected, { backgroundColor: colors.card, borderColor: colors.border, shadowColor: colors.foreground }],
              { opacity: pressed && !selected ? 0.7 : 1 },
            ]}
            testID={`tab-${tab.key}`}
          >
            <Ionicons name={selected ? tab.activeIcon : tab.icon} size={17} color={selected ? colors.primary : colors.mutedForeground} />
            <Text style={[styles.label, { color: selected ? colors.foreground : colors.mutedForeground, fontFamily: selected ? 'Inter_700Bold' : 'Inter_500Medium' }]}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: 16, borderWidth: 1, marginTop: 6 },
  tab: { flex: 1, minHeight: 46, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderWidth: 1, borderColor: 'transparent' },
  tabSelected: { shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  label: { fontSize: 14, letterSpacing: -0.1 },
});
