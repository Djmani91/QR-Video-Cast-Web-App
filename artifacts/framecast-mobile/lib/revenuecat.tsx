import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import Purchases, { type CustomerInfo, type PurchasesOfferings, type PurchasesPackage } from 'react-native-purchases';

export const PREMIUM_ENTITLEMENT_ID = 'premium';

type SubscriptionContextValue = {
  configured: boolean;
  loading: boolean;
  error: string;
  customerInfo: CustomerInfo | null;
  offerings: PurchasesOfferings | null;
  monthlyPackage: PurchasesPackage | null;
  isPremium: boolean;
  refresh: () => Promise<void>;
  purchase: (pkg: PurchasesPackage) => Promise<boolean>;
  restore: () => Promise<boolean>;
};

const SubscriptionContext = createContext<SubscriptionContextValue | null>(null);
let configuredOnce = false;
let configuredValue = false;

function configureRevenueCat() {
  if (Platform.OS !== 'android') return false;
  if (configuredOnce) return configuredValue;

  const apiKey = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY;
  if (!apiKey) {
    configuredOnce = true;
    configuredValue = false;
    return false;
  }

  try {
    Purchases.configure({ apiKey });
    configuredOnce = true;
    configuredValue = true;
    return true;
  } catch (error) {
    console.warn('RevenueCat could not be configured.', error);
    configuredOnce = true;
    configuredValue = false;
    return false;
  }
}

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [offerings, setOfferings] = useState<PurchasesOfferings | null>(null);
  const configuredRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!configuredRef.current) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    const results = await Promise.allSettled([
      Purchases.getCustomerInfo(),
      Purchases.getOfferings(),
    ]);

    if (results[0].status === 'fulfilled') {
      setCustomerInfo(results[0].value);
    } else {
      setError('Could not check the Google Play subscription status. You can still continue with ads.');
    }

    if (results[1].status === 'fulfilled') {
      setOfferings(results[1].value);
    } else if (results[0].status === 'fulfilled') {
      setError('The Google Play trial offer is not available yet. You can still continue with ads.');
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    const isConfigured = configureRevenueCat();
    configuredRef.current = isConfigured;
    setConfigured(isConfigured);

    if (!isConfigured) {
      setLoading(false);
      return;
    }

    const onCustomerInfoUpdated = (info: CustomerInfo) => setCustomerInfo(info);
    Purchases.addCustomerInfoUpdateListener(onCustomerInfoUpdated);
    void refresh();
    return () => {
      Purchases.removeCustomerInfoUpdateListener(onCustomerInfoUpdated);
    };
  }, [refresh]);

  const purchase = useCallback(async (pkg: PurchasesPackage) => {
    const result = await Purchases.purchasePackage(pkg);
    setCustomerInfo(result.customerInfo);
    return Boolean(result.customerInfo.entitlements.active[PREMIUM_ENTITLEMENT_ID]?.isActive);
  }, []);

  const restore = useCallback(async () => {
    const info = await Purchases.restorePurchases();
    setCustomerInfo(info);
    return Boolean(info.entitlements.active[PREMIUM_ENTITLEMENT_ID]?.isActive);
  }, []);

  const monthlyPackage = offerings?.current?.availablePackages.find(
    (pkg) => pkg.identifier === '$rc_monthly',
  ) ?? null;
  const isPremium = Boolean(customerInfo?.entitlements.active[PREMIUM_ENTITLEMENT_ID]?.isActive);
  const value = useMemo<SubscriptionContextValue>(() => ({
    configured,
    loading,
    error,
    customerInfo,
    offerings,
    monthlyPackage,
    isPremium,
    refresh,
    purchase,
    restore,
  }), [configured, loading, error, customerInfo, offerings, monthlyPackage, isPremium, refresh, purchase, restore]);

  return <SubscriptionContext.Provider value={value}>{children}</SubscriptionContext.Provider>;
}

export function useSubscription() {
  const value = useContext(SubscriptionContext);
  if (!value) throw new Error('useSubscription must be used within SubscriptionProvider.');
  return value;
}
