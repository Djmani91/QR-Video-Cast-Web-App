import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import Purchases from 'react-native-purchases';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useSubscription } from '@/lib/revenuecat';
import { useFreeCastingTrial } from '@/lib/free-casting-trial';

const PLAN_CHOICE_KEY = 'framecast.subscriptionChoice.v1';
const PLAY_SUBSCRIPTIONS_URL = 'https://play.google.com/store/account/subscriptions?package=com.tvcast.com';

type GateContextValue = {
  openPaywall: () => void;
  openExpiredTrialPaywall: () => void;
  dismissExpiredTrialPaywall: () => void;
  openFirstPairChoice: () => void;
  firstPairChoicePending: boolean;
};
const GateContext = createContext<GateContextValue>({
  openPaywall: () => undefined,
  openExpiredTrialPaywall: () => undefined,
  dismissExpiredTrialPaywall: () => undefined,
  openFirstPairChoice: () => undefined,
  firstPairChoicePending: false,
});

export function useSubscriptionChoiceGate() {
  return useContext(GateContext);
}

function hasThreeDayFreeTrial(pkg: ReturnType<typeof useSubscription>['monthlyPackage']) {
  const intro = pkg?.product.introPrice;
  return Boolean(
    intro
    && intro.price === 0
    && intro.periodNumberOfUnits === 3
    && intro.periodUnit.toUpperCase() === 'DAY',
  );
}

function SubscriptionChoiceScreen({
  onContinueWithAds,
  onPremiumActivated,
  onDismissExpired,
  mode,
}: {
  onContinueWithAds: () => void;
  onPremiumActivated: () => void;
  onDismissExpired: () => void;
  mode: 'offer' | 'expired';
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { configured, error: subscriptionError, monthlyPackage, purchase, restore } = useSubscription();
  const [busy, setBusy] = useState<'purchase' | 'restore' | null>(null);
  const [message, setMessage] = useState('');
  const [purchaseNeedsConfirmation, setPurchaseNeedsConfirmation] = useState(false);
  const trialAvailable = hasThreeDayFreeTrial(monthlyPackage);
  const priceString = monthlyPackage?.product.priceString;

  const startPremium = async () => {
    if (!monthlyPackage || busy || purchaseNeedsConfirmation) return;
    setBusy('purchase');
    setMessage('');
    try {
      const activated = await purchase(monthlyPackage);
      if (activated) {
        onPremiumActivated();
        return;
      }

      setPurchaseNeedsConfirmation(true);
      const restored = await restore().catch(() => false);
      if (restored) {
        onPremiumActivated();
        return;
      }
      setMessage('Google Play returned from the purchase, but FrameCast has not confirmed it yet. Do not buy again. Tap “Check existing purchase” below.');
    } catch (error) {
      const purchaseError = error as { userCancelled?: boolean; code?: string | number; message?: string };
      const errorCode = String(purchaseError?.code ?? '');
      const errorMessage = String(purchaseError?.message ?? '').toLowerCase();
      const cancelled = Boolean(purchaseError?.userCancelled)
        || errorCode === String(Purchases.PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR);
      if (cancelled) {
        setMessage(mode === 'expired'
          ? 'Purchase cancelled. You can try again when you are ready.'
          : 'Purchase cancelled. You can try again or continue with ads.');
        return;
      }

      const needsConfirmation = errorCode === String(Purchases.PURCHASES_ERROR_CODE.PRODUCT_ALREADY_PURCHASED_ERROR)
        || errorCode === String(Purchases.PURCHASES_ERROR_CODE.PAYMENT_PENDING_ERROR)
        || errorMessage.includes('acknowledg')
        || errorMessage.includes('already purchased');
      if (needsConfirmation) {
        setPurchaseNeedsConfirmation(true);
        const restored = await restore().catch(() => false);
        if (restored) {
          onPremiumActivated();
          return;
        }
        setMessage('Google Play already has a FrameCast purchase that is waiting for confirmation. Do not buy again. Tap “Check existing purchase” below.');
        return;
      }

      console.warn('RevenueCat purchase failed.', { code: errorCode || 'unknown' });
      setMessage('Google Play could not complete the purchase. Check your connection, then try again once.');
    } finally {
      setBusy(null);
    }
  };

  const restorePurchases = async () => {
    if (busy) return;
    setBusy('restore');
    setMessage('');
    try {
      const restored = await restore();
      if (restored) onPremiumActivated();
      else if (purchaseNeedsConfirmation) {
        setMessage('FrameCast still cannot confirm the existing purchase. Do not buy again yet. The Google Play connection must be fixed first.');
      } else {
        setMessage('No active FrameCast Premium purchase was found for this Google Play account.');
      }
    } catch {
      setMessage(purchaseNeedsConfirmation
        ? 'FrameCast could not verify the existing purchase. Do not buy again yet. Check your connection and try “Check existing purchase” again later.'
        : 'Could not restore purchases. Check your connection and try again.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: Math.max(insets.top, 18), paddingBottom: Math.max(insets.bottom, 18) }]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.brandRow}>
          <View style={[styles.brandIcon, { backgroundColor: colors.primary }]}>
            <Ionicons name="tv-outline" size={23} color={colors.primaryForeground} />
          </View>
          <Text style={[styles.brand, { color: colors.foreground }]}>framecast</Text>
        </View>

        <View style={[styles.trialBadge, { backgroundColor: colors.secondary }]}>
          <Ionicons name="sparkles-outline" size={15} color={colors.primary} />
          <Text style={[styles.badgeText, { color: colors.primary }]}>
            {mode === 'expired' ? '30-MINUTE ACCESS USED' : trialAvailable ? '3-DAY FREE TRIAL' : 'PREMIUM ACCESS'}
          </Text>
        </View>

        <Text style={[styles.title, { color: colors.foreground }]}>
          {mode === 'expired' ? 'Your free casting time is over' : 'Choose how to use FrameCast'}
        </Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          {mode === 'expired'
            ? 'Get Premium to keep casting. Your TV stays paired; disconnect whenever you want.'
            : trialAvailable
              ? 'Try Premium free for 3 days, or get one 30-minute ad-supported casting session. Cancel before the subscription trial ends to avoid the monthly charge.'
              : 'Choose Premium for background casting and ad-free access, or start one 30-minute ad-supported casting session.'}
        </Text>

        <View style={[styles.planCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.planHeading}>
            <View style={[styles.planIcon, { backgroundColor: colors.secondary }]}>
              <Ionicons name="star-outline" size={21} color={colors.primary} />
            </View>
            <View style={styles.planCopy}>
              <Text style={[styles.planTitle, { color: colors.foreground }]}>FrameCast Premium</Text>
              <Text style={[styles.planSubtitle, { color: colors.mutedForeground }]}>No ads or rewarded unlocks</Text>
            </View>
          </View>
          <View style={styles.benefits}>
            {[
              'Choose up to 20 photos and 20 videos per TV session',
              'Keep casting while you use other apps',
              'Mirror your screen without time limits or rewarded ads',
              'No banner, native, pairing or between-video ads',
            ].map((benefit) => (
              <View key={benefit} style={styles.benefitRow}>
                <Ionicons name="checkmark-circle" size={18} color={colors.primary} />
                <Text style={[styles.benefitText, { color: colors.foreground }]}>{benefit}</Text>
              </View>
            ))}
          </View>
        </View>

        <Pressable
          onPress={() => void startPremium()}
          disabled={!monthlyPackage || busy !== null || purchaseNeedsConfirmation}
          accessibilityRole="button"
          testID="button-start-premium"
          style={({ pressed }) => [
            styles.primaryButton,
            {
              backgroundColor: colors.primary,
              opacity: !monthlyPackage || busy !== null || purchaseNeedsConfirmation ? 0.55 : pressed ? 0.84 : 1,
            },
          ]}
        >
          {busy === 'purchase' ? (
            <View style={styles.buttonBusy}>
              <ActivityIndicator color={colors.primaryForeground} />
              <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>Opening Google Play…</Text>
            </View>
          ) : (
            <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>
              {purchaseNeedsConfirmation
                ? 'Purchase awaiting confirmation'
                : trialAvailable
                  ? 'Start 3-day free trial'
                  : monthlyPackage
                    ? 'Get FrameCast Premium'
                    : 'Premium unavailable'}
            </Text>
          )}
        </Pressable>

        <Text style={[styles.terms, { color: colors.mutedForeground }]}>
          {trialAvailable && priceString
            ? `Eligible new subscribers: 3 days free, then ${priceString} per month unless cancelled. Google Play confirms eligibility and billing before you approve. Cancel before the trial ends to avoid a charge.`
            : priceString
              ? `${priceString} per month. Google Play confirms eligibility and billing before you approve. The subscription renews until cancelled.`
            : configured
              ? 'The Google Play subscription is not available in this build. You can continue with ads.'
              : 'Google Play billing is not configured in this build yet. You can continue with ads.'}
        </Text>

        {(subscriptionError || message) ? (
          <Text style={[styles.message, { color: colors.destructive }]} accessibilityRole="alert">
            {message || subscriptionError}
          </Text>
        ) : null}

        {purchaseNeedsConfirmation ? (
          <Pressable
            onPress={() => void restorePurchases()}
            disabled={busy !== null}
            accessibilityRole="button"
            testID="button-check-existing-purchase"
            style={({ pressed }) => [
              styles.secondaryButton,
              { borderColor: colors.primary, backgroundColor: colors.card, opacity: busy !== null ? 0.55 : pressed ? 0.8 : 1 },
            ]}
          >
            {busy === 'restore' ? (
              <View style={styles.buttonBusy}>
                <ActivityIndicator color={colors.primary} />
                <Text style={[styles.secondaryButtonText, { color: colors.primary }]}>Checking purchase…</Text>
              </View>
            ) : (
              <Text style={[styles.secondaryButtonText, { color: colors.primary }]}>Check existing purchase</Text>
            )}
          </Pressable>
        ) : null}

        {mode === 'offer' ? (
          <Pressable
            onPress={onContinueWithAds}
            accessibilityRole="button"
            testID="button-continue-with-ads"
            style={({ pressed }) => [
              styles.secondaryButton,
              { borderColor: colors.border, backgroundColor: colors.card, opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <Text style={[styles.secondaryButtonText, { color: colors.foreground }]}>Continue with ads</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={onDismissExpired}
            accessibilityRole="button"
            testID="button-dismiss-expired-trial"
            style={({ pressed }) => [
              styles.secondaryButton,
              { borderColor: colors.border, backgroundColor: colors.card, opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <Text style={[styles.secondaryButtonText, { color: colors.foreground }]}>Not now</Text>
          </Pressable>
        )}

        <View style={styles.footerRow}>
          {!purchaseNeedsConfirmation ? (
            <>
              <Pressable onPress={() => void restorePurchases()} disabled={busy !== null} accessibilityRole="button" testID="button-restore-purchases">
                <Text style={[styles.footerLink, { color: colors.primary, opacity: busy ? 0.55 : 1 }]}>
                  {busy === 'restore' ? 'Restoring…' : 'Restore purchases'}
                </Text>
              </Pressable>
              <Text style={[styles.footerDot, { color: colors.mutedForeground }]}>·</Text>
            </>
          ) : null}
          <Pressable onPress={() => void Linking.openURL(PLAY_SUBSCRIPTIONS_URL)} accessibilityRole="link">
            <Text style={[styles.footerLink, { color: colors.primary }]}>Manage in Google Play</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

export function SubscriptionChoiceGate({ children }: { children: React.ReactNode }) {
  const colors = useColors();
  const { isPremium, loading, initialLoading } = useSubscription();
  const freeCastingTrial = useFreeCastingTrial();
  const [choice, setChoice] = useState<string | null>(null);
  const [choiceLoaded, setChoiceLoaded] = useState(false);
  const [forcedOpen, setForcedOpen] = useState(false);
  const [expiredTrialOpen, setExpiredTrialOpen] = useState(false);
  const [firstPairOfferRequested, setFirstPairOfferRequested] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'android') {
      setChoiceLoaded(true);
      return;
    }
    let active = true;
    void AsyncStorage.getItem(PLAN_CHOICE_KEY).then((saved) => {
      if (!active) return;
      setChoice(saved);
      setChoiceLoaded(true);
    }).catch(() => {
      if (!active) return;
      setChoice(null);
      setChoiceLoaded(true);
    });
    return () => { active = false; };
  }, []);

  const saveChoice = useCallback(async (value: 'ads' | 'premium') => {
    if (saving) return;
    setSaving(true);
    try {
      await AsyncStorage.setItem(PLAN_CHOICE_KEY, value);
      setChoice(value);
      setForcedOpen(false);
    } catch {
      setChoice(value);
      setForcedOpen(false);
    } finally {
      setSaving(false);
    }
  }, [saving]);

  const openPaywall = useCallback(() => {
    if (!isPremium) {
      setExpiredTrialOpen(freeCastingTrial.expired);
      setForcedOpen(true);
    }
  }, [freeCastingTrial.expired, isPremium]);
  const openExpiredTrialPaywall = useCallback(() => {
    if (!isPremium) {
      setExpiredTrialOpen(true);
      setForcedOpen(true);
    }
  }, [isPremium]);
  const dismissExpiredTrialPaywall = useCallback(() => {
    setExpiredTrialOpen(false);
    setForcedOpen(false);
  }, []);
  const openFirstPairChoice = useCallback(() => {
    setFirstPairOfferRequested(true);
  }, []);
  const firstPairChoicePending = Platform.OS === 'android'
    && !isPremium
    && !loading
    && choiceLoaded
    && choice === null
    && firstPairOfferRequested;
  const gateValue = useMemo(
    () => ({ openPaywall, openExpiredTrialPaywall, dismissExpiredTrialPaywall, openFirstPairChoice, firstPairChoicePending }),
    [dismissExpiredTrialPaywall, openExpiredTrialPaywall, openPaywall, openFirstPairChoice, firstPairChoicePending],
  );

  if (Platform.OS !== 'android') return <GateContext.Provider value={gateValue}>{children}</GateContext.Provider>;

  if (!choiceLoaded || initialLoading) {
    return (
      <GateContext.Provider value={gateValue}>
        <View style={[styles.loadingScreen, { backgroundColor: colors.background }]}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </GateContext.Provider>
    );
  }

  const showChoice = !isPremium && (forcedOpen || firstPairChoicePending);
  return (
    <GateContext.Provider value={gateValue}>
      <View style={styles.appShell}>
        {children}
        {showChoice ? (
          <View style={styles.offerOverlay}>
            <SubscriptionChoiceScreen
              onContinueWithAds={() => void saveChoice('ads')}
              onPremiumActivated={() => void saveChoice('premium')}
              onDismissExpired={dismissExpiredTrialPaywall}
              mode={expiredTrialOpen ? 'expired' : 'offer'}
            />
          </View>
        ) : null}
      </View>
    </GateContext.Provider>
  );
}

const styles = StyleSheet.create({
  appShell: { flex: 1 },
  offerOverlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 1000, elevation: 1000 },
  screen: { flex: 1 },
  scroll: { flexGrow: 1, width: '100%', maxWidth: 520, alignSelf: 'center', paddingHorizontal: 24, paddingTop: 18, paddingBottom: 18 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 28 },
  brandIcon: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  brand: { fontFamily: 'Inter_700Bold', fontSize: 20, letterSpacing: -0.6 },
  trialBadge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 100, marginBottom: 14 },
  badgeText: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 0.8 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 30, lineHeight: 36, letterSpacing: -0.8 },
  subtitle: { fontFamily: 'Inter_400Regular', fontSize: 15, lineHeight: 22, marginTop: 9, marginBottom: 20 },
  planCard: { borderWidth: 1, borderRadius: 20, padding: 17, marginBottom: 16 },
  planHeading: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 17 },
  planIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  planCopy: { flex: 1 },
  planTitle: { fontFamily: 'Inter_700Bold', fontSize: 16 },
  planSubtitle: { fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 3 },
  benefits: { gap: 13 },
  benefitRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  benefitText: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19 },
  primaryButton: { minHeight: 54, borderRadius: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  primaryButtonText: { fontFamily: 'Inter_700Bold', fontSize: 15 },
  terms: { fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 17, textAlign: 'center', marginTop: 11, marginBottom: 14 },
  message: { fontFamily: 'Inter_500Medium', fontSize: 12, lineHeight: 18, textAlign: 'center', marginBottom: 12 },
  secondaryButton: { minHeight: 52, borderWidth: 1, borderRadius: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  secondaryButtonText: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  buttonBusy: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  footerRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10, marginTop: 19 },
  footerLink: { fontFamily: 'Inter_500Medium', fontSize: 12 },
  footerDot: { fontSize: 16 },
  loadingScreen: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
