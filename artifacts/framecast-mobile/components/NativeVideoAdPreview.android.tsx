import { useEffect, useState, type ReactNode } from 'react';
import { NativeAsset, NativeAssetType, NativeAdView, NativeMediaView, AdsConsent, TestIds, useNativeAd, default as mobileAds } from 'react-native-google-mobile-ads';
import { StyleSheet, Text, View } from 'react-native';

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
  children: ReactNode;
  colors: Palette;
};

const ANDROID_NATIVE_AD_UNIT_ID = __DEV__
  ? TestIds.NATIVE
  : process.env.EXPO_PUBLIC_ADMOB_ANDROID_NATIVE_UNIT_ID || null;

export function NativeVideoAdPreview({ children, colors }: Props) {
  const [consentReady, setConsentReady] = useState(false);

  useEffect(() => {
    let active = true;
    if (!ANDROID_NATIVE_AD_UNIT_ID) return () => { active = false; };

    void (async () => {
      try {
        const consent = await AdsConsent.getConsentInfo();
        if (!active || !consent.canRequestAds) return;
        await mobileAds().initialize();
        if (active) setConsentReady(true);
      } catch (error) {
        if (__DEV__) console.warn('FrameCast could not prepare a native video ad.', error);
      }
    })();

    return () => { active = false; };
  }, []);

  const { nativeAd, status, error } = useNativeAd({
    adUnitId: ANDROID_NATIVE_AD_UNIT_ID,
    autoLoad: consentReady,
    requestOptions: { startVideoMuted: true },
  });

  useEffect(() => {
    if (__DEV__ && status === 'error' && error) {
      console.warn('FrameCast native video ad failed to load.', error.message);
    }
  }, [error, status]);

  if (status !== 'loaded' || !nativeAd?.mediaContent) return <>{children}</>;

  return (
    <NativeAdView
      nativeAd={nativeAd}
      style={[StyleSheet.absoluteFill, styles.adView, { backgroundColor: colors.card }]}
      accessibilityLabel="Sponsored ad"
      testID="native-video-ad-preview"
    >
      <NativeMediaView resizeMode="contain" style={StyleSheet.absoluteFill} />
      <View style={[styles.adBadge, { backgroundColor: colors.primary }]} pointerEvents="none">
        <Text style={[styles.adBadgeText, { color: colors.primaryForeground }]}>Ad</Text>
      </View>
      <View style={[styles.adFooter, { backgroundColor: colors.card }]}>
        <View style={styles.adCopy}>
          <NativeAsset assetType={NativeAssetType.HEADLINE}>
            <Text numberOfLines={2} style={[styles.headline, { color: colors.foreground }]}>
              {nativeAd.headline}
            </Text>
          </NativeAsset>
          {nativeAd.advertiser ? (
            <NativeAsset assetType={NativeAssetType.ADVERTISER}>
              <Text numberOfLines={1} style={[styles.advertiser, { color: colors.mutedForeground }]}>
                {nativeAd.advertiser}
              </Text>
            </NativeAsset>
          ) : null}
        </View>
        {nativeAd.callToAction ? (
          <NativeAsset assetType={NativeAssetType.CALL_TO_ACTION}>
            <Text style={[styles.callToAction, { backgroundColor: colors.primary, color: colors.primaryForeground }]}>
              {nativeAd.callToAction}
            </Text>
          </NativeAsset>
        ) : null}
      </View>
    </NativeAdView>
  );
}

const styles = StyleSheet.create({
  adView: {
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  adBadge: {
    position: 'absolute',
    top: 9,
    left: 9,
    zIndex: 2,
    borderRadius: 5,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  adBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  adFooter: {
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    zIndex: 1,
  },
  adCopy: {
    flex: 1,
    gap: 3,
  },
  headline: {
    fontSize: 12,
    fontWeight: '700',
  },
  advertiser: {
    fontSize: 10,
  },
  callToAction: {
    maxWidth: 116,
    overflow: 'hidden',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
});
