import { Image } from 'expo-image';
import type { VideoThumbnail } from 'expo-video';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

export type SelectedMedia = {
  uri: string;
  name: string;
  mimeType: string;
  kind: 'video' | 'image';
  size?: number;
  duration?: number;
  temporaryCopy?: boolean;
  compatibleUri?: string;
  compatibleName?: string;
  compatibleSize?: number;
};

type Palette = {
  background: string;
  card: string;
  border: string;
  foreground: string;
  mutedForeground: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
};

type Props = {
  items: SelectedMedia[];
  selectedIndex: number;
  thumbnails: Record<string, VideoThumbnail>;
  paused: boolean;
  status: string;
  canAdd: boolean;
  canControlVideo: boolean;
  canSelectItem(index: number): boolean;
  colors: Palette;
  onSelect(index: number): void;
  onAdd(): void;
  onChange(): void;
  onPlayPause(): void;
  onPrevious(): void;
  onNext(): void;
};

function formatSize(bytes?: number) {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(duration?: number) {
  if (duration === undefined || !Number.isFinite(duration) || duration < 0) return '';
  const totalSeconds = Math.floor(duration / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function MediaPlaylist({
  items,
  selectedIndex,
  thumbnails,
  paused,
  status,
  canAdd,
  canControlVideo,
  canSelectItem,
  colors,
  onSelect,
  onAdd,
  onChange,
  onPlayPause,
  onPrevious,
  onNext,
}: Props) {
  const selected = items[selectedIndex];
  if (!selected) return null;

  const selectedThumbnail = selected.kind === 'video' ? thumbnails[selected.uri] : undefined;
  const fileMeta = [
    selected.kind === 'video' ? formatDuration(selected.duration) : '',
    formatSize(selected.size),
  ].filter(Boolean).join(' · ');

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]} testID="media-playlist">
      <View style={[styles.preview, { backgroundColor: colors.background }]}>
        {selected.kind === 'image' ? (
          <Image
            source={{ uri: selected.uri }}
            style={StyleSheet.absoluteFill}
            contentFit="contain"
            cachePolicy="none"
            accessibilityLabel={`Preview of ${selected.name}`}
          />
        ) : selectedThumbnail ? (
          <Image
            source={selectedThumbnail}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            cachePolicy="none"
            accessibilityLabel={`Video thumbnail for ${selected.name}`}
          />
        ) : (
          <View style={styles.videoPoster}>
            <Ionicons name="film-outline" size={54} color={colors.primary} />
            <Text style={[styles.posterText, { color: colors.mutedForeground }]}>VIDEO</Text>
          </View>
        )}

        <View style={[styles.positionBadge, { backgroundColor: `${colors.background}E8` }]}>
          <Ionicons
            name={selected.kind === 'video' ? 'videocam-outline' : 'images-outline'}
            size={14}
            color={colors.primary}
          />
          <Text style={[styles.positionText, { color: colors.foreground }]}>
            {selected.kind === 'video' ? 'VIDEO' : 'PHOTO'} {selectedIndex + 1} / {items.length}
          </Text>
        </View>

        {selected.kind === 'video' ? (
          <Pressable
            style={[styles.heroPlayButton, { backgroundColor: `${colors.background}D9` }]}
            onPress={onPlayPause}
            disabled={!canControlVideo}
            accessibilityRole="button"
            accessibilityLabel={paused ? 'Play video on TV' : 'Pause video on TV'}
          >
            <Ionicons name={paused ? 'play' : 'pause'} size={28} color={colors.primary} />
          </Pressable>
        ) : null}

        <View style={[styles.caption, { backgroundColor: `${colors.background}E8` }]}>
          <View style={styles.captionCopy}>
            <Text numberOfLines={1} style={[styles.mediaName, { color: colors.foreground }]}>{selected.name}</Text>
            {fileMeta ? <Text style={[styles.mediaMeta, { color: colors.mutedForeground }]}>{fileMeta}</Text> : null}
          </View>
          <Text style={[styles.status, { color: colors.primary }]} numberOfLines={1}>{status}</Text>
        </View>
      </View>

      <View style={styles.galleryHeader}>
        <View>
          <Text style={[styles.galleryTitle, { color: colors.foreground }]}>PLAYLIST</Text>
          <Text style={[styles.galleryCount, { color: colors.mutedForeground }]}>
            {items.length === 1 ? '1 item' : `${items.length} items · tap one to play`}
          </Text>
        </View>
        <View style={styles.galleryActions}>
          {canAdd ? (
            <Pressable
              style={[styles.galleryAction, { backgroundColor: colors.secondary }]}
              onPress={onAdd}
              accessibilityRole="button"
              accessibilityLabel={`Add more ${selected.kind === 'video' ? 'videos' : 'photos'}`}
              testID={`button-add-more-${selected.kind === 'video' ? 'videos' : 'photos'}`}
            >
              <Ionicons name="add" size={17} color={colors.primary} />
              <Text style={[styles.galleryActionText, { color: colors.primary }]}>Add</Text>
            </Pressable>
          ) : null}
          <Pressable
            style={[styles.galleryAction, { backgroundColor: colors.secondary }]}
            onPress={onChange}
            accessibilityRole="button"
            accessibilityLabel="Choose different media"
            testID="button-change-media"
          >
            <Ionicons name="swap-horizontal-outline" size={16} color={colors.mutedForeground} />
            <Text style={[styles.galleryActionText, { color: colors.mutedForeground }]}>Change</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.thumbnailList}
        accessibilityLabel="Media playlist"
      >
        {items.map((item, index) => {
          const thumbnail = item.kind === 'video' ? thumbnails[item.uri] : undefined;
          const active = index === selectedIndex;
          const selectable = canSelectItem(index);
          return (
            <Pressable
              key={`${item.uri}-${index}`}
              onPress={() => onSelect(index)}
              disabled={!selectable}
              style={[
                styles.thumbnail,
                { borderColor: active ? colors.primary : colors.border, backgroundColor: colors.background },
                active && styles.thumbnailActive,
                !selectable && styles.thumbnailDisabled,
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Play ${item.kind} ${index + 1}: ${item.name}`}
              accessibilityState={{ selected: active }}
              testID={`playlist-item-${index}`}
            >
              {item.kind === 'image' ? (
                <Image
                  source={{ uri: item.uri }}
                  style={styles.thumbnailImage}
                  contentFit="cover"
                  cachePolicy="none"
                />
              ) : thumbnail ? (
                <Image
                  source={thumbnail}
                  style={styles.thumbnailImage}
                  contentFit="cover"
                  cachePolicy="none"
                />
              ) : (
                <Ionicons name="film-outline" size={27} color={colors.primary} />
              )}
              {item.kind === 'video' ? (
                <View style={[styles.videoMarker, { backgroundColor: `${colors.background}E8` }]}>
                  <Ionicons name="play" size={10} color={colors.primary} />
                </View>
              ) : null}
              {active ? <View style={[styles.activeMark, { backgroundColor: colors.primary }]} /> : null}
            </Pressable>
          );
        })}
      </ScrollView>

      {items.length > 1 ? (
        <View style={styles.transport}>
          <Pressable
            onPress={onPrevious}
            disabled={selectedIndex === 0}
            style={[styles.transportButton, { backgroundColor: colors.secondary, opacity: selectedIndex === 0 ? 0.45 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel="Play previous item"
            testID="button-play-previous"
          >
            <Ionicons name="play-skip-back" size={19} color={colors.foreground} />
          </Pressable>
          {selected.kind === 'video' ? (
            <Pressable
              onPress={onPlayPause}
              disabled={!canControlVideo}
              style={[styles.mainTransportButton, { backgroundColor: colors.primary }]}
              accessibilityRole="button"
              accessibilityLabel={paused ? 'Play video on TV' : 'Pause video on TV'}
              testID="button-playlist-play-pause"
            >
              <Ionicons name={paused ? 'play' : 'pause'} size={20} color={colors.primaryForeground} />
            </Pressable>
          ) : (
            <View style={styles.photoPosition}>
              <Text style={[styles.photoPositionText, { color: colors.mutedForeground }]}>
                {selectedIndex + 1} / {items.length}
              </Text>
            </View>
          )}
          <Pressable
            onPress={onNext}
            disabled={selectedIndex >= items.length - 1}
            style={[styles.transportButton, { backgroundColor: colors.secondary, opacity: selectedIndex >= items.length - 1 ? 0.45 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel="Play next item"
            testID="button-play-next"
          >
            <Ionicons name="play-skip-forward" size={19} color={colors.foreground} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 12,
    gap: 14,
  },
  preview: {
    width: '100%',
    aspectRatio: 1.55,
    borderRadius: 17,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoPoster: {
    alignItems: 'center',
    gap: 7,
  },
  posterText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
  },
  positionBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  positionText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.7,
  },
  heroPlayButton: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
  },
  caption: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  captionCopy: {
    flex: 1,
    gap: 2,
  },
  mediaName: {
    fontSize: 14,
    fontWeight: '700',
  },
  mediaMeta: {
    fontSize: 11,
  },
  status: {
    maxWidth: '35%',
    fontSize: 11,
    fontWeight: '600',
  },
  galleryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  galleryTitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  galleryCount: {
    marginTop: 3,
    fontSize: 12,
  },
  galleryActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  galleryAction: {
    minHeight: 34,
    borderRadius: 11,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  galleryActionText: {
    fontSize: 12,
    fontWeight: '600',
  },
  thumbnailList: {
    gap: 9,
    paddingRight: 4,
    paddingVertical: 2,
  },
  thumbnail: {
    width: 72,
    height: 70,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbnailActive: {
    borderWidth: 2,
  },
  thumbnailDisabled: {
    opacity: 0.45,
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
  },
  videoMarker: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    width: 19,
    height: 19,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeMark: {
    position: 'absolute',
    right: 5,
    top: 5,
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  transport: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
    paddingTop: 1,
  },
  transportButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mainTransportButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoPosition: {
    width: 50,
    alignItems: 'center',
  },
  photoPositionText: {
    fontSize: 13,
    fontWeight: '700',
  },
});
