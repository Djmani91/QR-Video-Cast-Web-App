import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { useColors } from '@/hooks/useColors';
import { getYouTubeVideoId } from '@/lib/youtube';
import {
  parseVideoBrowserMessage,
  VIDEO_BROWSER_DETECTION_SCRIPT,
} from '@/lib/video-browser-detector';
import type { VideoBrowserProps } from './VideoBrowser';

function normalizeBrowserAddress(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error('Enter a website address first.');
  const complete = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(complete);
  } catch {
    throw new Error('Enter a valid website address.');
  }
  if ((url.protocol !== 'https:' && url.protocol !== 'http:') || !url.hostname) {
    throw new Error('Use a website address starting with http:// or https://.');
  }
  if (url.username || url.password) {
    throw new Error('For safety, enter the website address without a username or password.');
  }
  return url.href;
}

function isAllowedNavigation(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === 'https:' || url.protocol === 'http:') && Boolean(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function VideoBrowser({ initialUrl, onClose, onPlayVideo }: VideoBrowserProps) {
  const colors = useColors();
  const webViewRef = useRef<WebView>(null);
  const [address, setAddress] = useState(initialUrl);
  const [sourceUrl, setSourceUrl] = useState<string | null>(() => {
    try {
      return initialUrl ? normalizeBrowserAddress(initialUrl) : null;
    } catch {
      return null;
    }
  });
  const [pageUrl, setPageUrl] = useState('');
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [loading, setLoading] = useState(Boolean(initialUrl));
  const [addressError, setAddressError] = useState('');
  const [pageError, setPageError] = useState('');
  const [scan, setScan] = useState<ReturnType<typeof parseVideoBrowserMessage>>(null);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (canGoBack) {
        webViewRef.current?.goBack();
        return true;
      }
      onClose();
      return true;
    });
    return () => subscription.remove();
  }, [canGoBack, onClose]);

  const openAddress = () => {
    Keyboard.dismiss();
    setAddressError('');
    setPageError('');
    setScan(null);
    try {
      const nextUrl = normalizeBrowserAddress(address);
      setAddress(nextUrl);
      if (nextUrl === sourceUrl) {
        webViewRef.current?.reload();
      } else {
        setSourceUrl(nextUrl);
        setPageUrl(nextUrl);
      }
      setLoading(true);
    } catch (error) {
      setAddressError(error instanceof Error ? error.message : 'Enter a valid website address.');
    }
  };

  const handleMessage = (rawMessage: string) => {
    const parsed = parseVideoBrowserMessage(rawMessage);
    if (parsed) setScan(parsed);
  };

  const isYouTubePage = Boolean(pageUrl && getYouTubeVideoId(pageUrl));

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} testID="screen-video-browser">
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={onClose} style={styles.iconButton} accessibilityRole="button" accessibilityLabel="Close browser" testID="button-close-video-browser">
          <Ionicons name="close" size={23} color={colors.foreground} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Browse for a video</Text>
          <Text style={[styles.headerSubtitle, { color: colors.mutedForeground }]}>Private on this phone</Text>
        </View>
        <Pressable
          onPress={() => webViewRef.current?.reload()}
          disabled={!sourceUrl}
          style={[styles.iconButton, !sourceUrl && styles.disabled]}
          accessibilityRole="button"
          accessibilityLabel="Reload webpage"
          testID="button-reload-video-browser"
        >
          <Ionicons name="refresh" size={20} color={colors.foreground} />
        </Pressable>
      </View>

      <View style={[styles.addressBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Ionicons name="globe-outline" size={18} color={colors.mutedForeground} />
        <TextInput
          value={address}
          onChangeText={(value) => {
            setAddress(value);
            setAddressError('');
          }}
          onSubmitEditing={openAddress}
          placeholder="Paste or type a website address"
          placeholderTextColor={colors.mutedForeground}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="go"
          selectTextOnFocus
          style={[styles.addressInput, { color: colors.foreground }]}
          accessibilityLabel="Website address"
          testID="input-video-browser-address"
        />
        <Pressable
          onPress={openAddress}
          disabled={!address.trim()}
          style={[styles.goButton, { backgroundColor: colors.primary }, !address.trim() && styles.disabled]}
          accessibilityRole="button"
          accessibilityLabel="Open website"
          testID="button-video-browser-go"
        >
          <Ionicons name="arrow-forward" size={19} color={colors.primaryForeground} />
        </Pressable>
      </View>
      {addressError ? <Text style={[styles.errorText, { color: colors.destructive }]} accessibilityRole="alert">{addressError}</Text> : null}

      <View style={styles.navigationRow}>
        <Pressable
          onPress={() => webViewRef.current?.goBack()}
          disabled={!canGoBack}
          style={[styles.navigationButton, !canGoBack && styles.disabled]}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          testID="button-video-browser-back"
        >
          <Ionicons name="arrow-back" size={18} color={canGoBack ? colors.foreground : colors.mutedForeground} />
        </Pressable>
        <Pressable
          onPress={() => webViewRef.current?.goForward()}
          disabled={!canGoForward}
          style={[styles.navigationButton, !canGoForward && styles.disabled]}
          accessibilityRole="button"
          accessibilityLabel="Go forward"
          testID="button-video-browser-forward"
        >
          <Ionicons name="arrow-forward" size={18} color={canGoForward ? colors.foreground : colors.mutedForeground} />
        </Pressable>
        <Text numberOfLines={1} style={[styles.currentSite, { color: colors.mutedForeground }]}>
          {pageUrl ? (() => { try { return new URL(pageUrl).hostname; } catch { return ''; } })() : 'Enter a website to begin'}
        </Text>
        {loading ? <ActivityIndicator size="small" color={colors.primary} /> : null}
      </View>

      <View style={[styles.page, { backgroundColor: colors.background }]}>
        {sourceUrl ? (
          <WebView
            ref={webViewRef}
            source={{ uri: sourceUrl }}
            style={styles.webView}
            originWhitelist={['http://*', 'https://*']}
            onShouldStartLoadWithRequest={(request) => isAllowedNavigation(request.url)}
            onNavigationStateChange={(navigation) => {
              setCanGoBack(navigation.canGoBack);
              setCanGoForward(navigation.canGoForward);
              if (navigation.url && isAllowedNavigation(navigation.url)) {
                setPageUrl(navigation.url);
                setAddress(navigation.url);
              }
            }}
            onLoadStart={() => {
              setLoading(true);
              setPageError('');
              setScan(null);
            }}
            onLoadEnd={() => setLoading(false)}
            onError={() => {
              setLoading(false);
              setPageError('This page could not be opened. Check the address and try again.');
            }}
            onMessage={(event) => handleMessage(event.nativeEvent.data)}
            injectedJavaScript={VIDEO_BROWSER_DETECTION_SCRIPT}
            javaScriptEnabled
            domStorageEnabled
            allowsFullscreenVideo
            mediaPlaybackRequiresUserAction
            incognito
            cacheEnabled={false}
            setSupportMultipleWindows={false}
            javaScriptCanOpenWindowsAutomatically={false}
            mixedContentMode="never"
            allowFileAccess={false}
            allowUniversalAccessFromFileURLs={false}
            testID="webview-video-browser"
          />
        ) : (
          <View style={styles.emptyPage}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.secondary }]}>
              <Ionicons name="search-outline" size={30} color={colors.primary} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Open a video website</Text>
            <Text style={[styles.emptyBody, { color: colors.mutedForeground }]}>
              Play a video on the page. FrameCast will look for a normal video link the TV can open.
            </Text>
          </View>
        )}
        {loading && sourceUrl ? (
          <View pointerEvents="none" style={[styles.loadingBadge, { backgroundColor: colors.card }]}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.foreground }]}>Loading page…</Text>
          </View>
        ) : null}
      </View>

      <View style={[styles.detectedPanel, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
        {pageError ? (
          <Text style={[styles.panelHint, { color: colors.destructive }]} accessibilityRole="alert">{pageError}</Text>
        ) : isYouTubePage ? (
          <>
            <View style={styles.panelHeading}>
              <Ionicons name="logo-youtube" size={19} color={colors.accent} />
              <Text style={[styles.panelTitle, { color: colors.foreground }]}>Use YouTube’s official player</Text>
            </View>
            <Pressable
              onPress={() => onPlayVideo(pageUrl)}
              style={({ pressed }) => [styles.playButton, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}
              accessibilityRole="button"
              testID="button-video-browser-youtube"
            >
              <Ionicons name="play" size={18} color={colors.primaryForeground} />
              <Text style={[styles.playButtonText, { color: colors.primaryForeground }]}>Play on TV</Text>
            </Pressable>
          </>
        ) : scan?.candidates.length ? (
          <>
            <View style={styles.panelHeading}>
              <Ionicons name="checkmark-circle-outline" size={19} color={colors.primary} />
              <Text style={[styles.panelTitle, { color: colors.foreground }]}>
                {scan.candidates.length === 1 ? 'Video link found' : `${scan.candidates.length} video links found`}
              </Text>
            </View>
            <ScrollView style={styles.candidateList} contentContainerStyle={styles.candidateListContent}>
              {scan.candidates.map((candidate, index) => (
                <Pressable
                  key={`${candidate.url}-${index}`}
                  onPress={() => onPlayVideo(candidate.url)}
                  style={({ pressed }) => [styles.playButton, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}
                  accessibilityRole="button"
                  accessibilityLabel={`Play detected ${candidate.label} on TV`}
                  testID={`button-video-browser-candidate-${index}`}
                >
                  <Ionicons name="play" size={17} color={colors.primaryForeground} />
                  <Text style={[styles.playButtonText, { color: colors.primaryForeground }]}>{candidate.label} · Play on TV</Text>
                </Pressable>
              ))}
            </ScrollView>
            <Text style={[styles.panelHint, { color: colors.mutedForeground }]}>
              The TV opens the source directly. Some sites require a sign-in or do not allow playback on another device.
            </Text>
          </>
        ) : scan?.videoCount ? (
          <Text style={[styles.panelHint, { color: colors.mutedForeground }]}>
            A video player was found, but this page does not expose a shareable link. Protected or app-only streams cannot be sent this way.
          </Text>
        ) : (
          <Text style={[styles.panelHint, { color: colors.mutedForeground }]}>
            {sourceUrl
              ? 'Play a video on this page to check for a shareable video link.'
              : 'FrameCast checks only video links exposed by the page; it does not upload or relay the video.'}
          </Text>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  header: { minHeight: 55, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1 },
  headerTitle: { fontFamily: 'Inter_700Bold', fontSize: 16 },
  headerSubtitle: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 2 },
  addressBar: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 9, marginHorizontal: 14, marginTop: 12, paddingLeft: 12, paddingRight: 6, borderWidth: 1, borderRadius: 15 },
  addressInput: { flex: 1, minHeight: 44, fontFamily: 'Inter_400Regular', fontSize: 13 },
  goButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  errorText: { marginHorizontal: 16, marginTop: 5, fontFamily: 'Inter_500Medium', fontSize: 12 },
  navigationRow: { height: 42, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12 },
  navigationButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  currentSite: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 11, marginHorizontal: 5 },
  page: { flex: 1, minHeight: 170, overflow: 'hidden' },
  webView: { flex: 1, backgroundColor: 'transparent' },
  emptyPage: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 38 },
  emptyIcon: { width: 62, height: 62, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 17 },
  emptyTitle: { fontFamily: 'Inter_700Bold', fontSize: 19, textAlign: 'center' },
  emptyBody: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 8 },
  loadingBadge: { position: 'absolute', top: 12, right: 12, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 14, elevation: 2 },
  loadingText: { fontFamily: 'Inter_500Medium', fontSize: 11 },
  detectedPanel: { maxHeight: 220, minHeight: 76, paddingHorizontal: 15, paddingTop: 11, paddingBottom: 8, borderTopWidth: StyleSheet.hairlineWidth },
  panelHeading: { minHeight: 26, flexDirection: 'row', alignItems: 'center', gap: 8 },
  panelTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 13, flex: 1 },
  panelHint: { fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 16, paddingVertical: 5 },
  candidateList: { maxHeight: 120, marginTop: 5 },
  candidateListContent: { gap: 7 },
  playButton: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 12, borderRadius: 13 },
  playButtonText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  disabled: { opacity: 0.42 },
});
