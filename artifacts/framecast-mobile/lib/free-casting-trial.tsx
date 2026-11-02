import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const FREE_CASTING_TRIAL_DURATION_MS = 30 * 60 * 1000;
const FREE_CASTING_TRIAL_KEY = 'framecast.freeCastingTrial.v1';
const TRIAL_SAVE_INTERVAL_MS = 10_000;

export type FreeCastingTrialRecord = {
  hasStarted: boolean;
  remainingMs: number;
};

export function createFreeCastingTrialRecord(): FreeCastingTrialRecord {
  return { hasStarted: false, remainingMs: FREE_CASTING_TRIAL_DURATION_MS };
}

export function parseFreeCastingTrialRecord(value: string | null): FreeCastingTrialRecord | null {
  if (value === null) return createFreeCastingTrialRecord();
  try {
    const parsed = JSON.parse(value) as Partial<FreeCastingTrialRecord>;
    if (typeof parsed.hasStarted !== 'boolean' || !Number.isFinite(parsed.remainingMs)) return null;
    return {
      hasStarted: parsed.hasStarted,
      remainingMs: Math.max(0, Math.min(FREE_CASTING_TRIAL_DURATION_MS, Math.floor(parsed.remainingMs!))),
    };
  } catch {
    return null;
  }
}

export function remainingFreeCastingTrialMs(
  record: FreeCastingTrialRecord,
  activeSince: number | null,
  now: number,
): number {
  if (activeSince === null) return record.remainingMs;
  return Math.max(0, record.remainingMs - Math.max(0, now - activeSince));
}

export function formatFreeCastingTrialTime(milliseconds: number): string {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

type FreeCastingTrialContextValue = {
  loaded: boolean;
  hasStarted: boolean;
  isCountingDown: boolean;
  remainingMs: number;
  expired: boolean;
  available: boolean;
  error: string;
  setSessionConnected: (connected: boolean, premium: boolean) => void;
};

const FreeCastingTrialContext = createContext<FreeCastingTrialContextValue | null>(null);

export function FreeCastingTrialProvider({ children }: { children: React.ReactNode }) {
  const [loaded, setLoaded] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [isCountingDown, setIsCountingDown] = useState(false);
  const [remainingMs, setRemainingMs] = useState(FREE_CASTING_TRIAL_DURATION_MS);
  const [error, setError] = useState('');

  const recordRef = useRef<FreeCastingTrialRecord>(createFreeCastingTrialRecord());
  const activeSinceRef = useRef<number | null>(null);
  const lastSaveAtRef = useRef(0);
  const connectedRef = useRef(false);
  const premiumRef = useRef(false);
  const appStateRef = useRef(AppState.currentState);
  const reconcilingRef = useRef(false);
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());
  const reconcileRef = useRef<() => void>(() => undefined);

  const publishRecord = useCallback((record: FreeCastingTrialRecord) => {
    recordRef.current = record;
    setHasStarted(record.hasStarted);
    setRemainingMs(record.remainingMs);
  }, []);

  const persistRecord = useCallback((record: FreeCastingTrialRecord) => {
    const serialized = JSON.stringify(record);
    const next = saveChainRef.current
      .catch(() => undefined)
      .then(() => AsyncStorage.setItem(FREE_CASTING_TRIAL_KEY, serialized));
    saveChainRef.current = next;
    return next;
  }, []);

  const stopForStorageError = useCallback(() => {
    activeSinceRef.current = null;
    setIsCountingDown(false);
    setError('FrameCast could not save your free access time. Check your phone storage, then reopen the app.');
  }, []);

  const reconcile = useCallback(() => {
    if (!loaded) return;
    const shouldCount = Platform.OS !== 'web'
      && connectedRef.current
      && appStateRef.current === 'active'
      && !premiumRef.current
      && !error;

    if (shouldCount && activeSinceRef.current === null && !reconcilingRef.current) {
      const now = Date.now();
      const remaining = remainingFreeCastingTrialMs(recordRef.current, null, now);
      if (remaining <= 0) {
        const expiredRecord = { hasStarted: true, remainingMs: 0 };
        publishRecord(expiredRecord);
        void persistRecord(expiredRecord).catch(stopForStorageError);
        return;
      }
      reconcilingRef.current = true;
      const nextRecord = { hasStarted: true, remainingMs: remaining };
      const startTimer = () => {
        reconcilingRef.current = false;
        if (
          !connectedRef.current
          || appStateRef.current !== 'active'
          || premiumRef.current
          || error
        ) {
          publishRecord(nextRecord);
          reconcileRef.current();
          return;
        }
        publishRecord(nextRecord);
        activeSinceRef.current = Date.now();
        lastSaveAtRef.current = Date.now();
        setIsCountingDown(true);
      };
      if (!recordRef.current.hasStarted) {
        void persistRecord(nextRecord).then(startTimer).catch(() => {
          reconcilingRef.current = false;
          stopForStorageError();
        });
      } else {
        startTimer();
      }
      return;
    }

    if (!shouldCount && activeSinceRef.current !== null) {
      const now = Date.now();
      const pausedRecord = {
        hasStarted: true,
        remainingMs: remainingFreeCastingTrialMs(recordRef.current, activeSinceRef.current, now),
      };
      activeSinceRef.current = null;
      publishRecord(pausedRecord);
      setIsCountingDown(false);
      lastSaveAtRef.current = now;
      void persistRecord(pausedRecord).catch(stopForStorageError);
    }
  }, [error, loaded, persistRecord, publishRecord, stopForStorageError]);
  reconcileRef.current = reconcile;

  useEffect(() => {
    let mounted = true;
    void AsyncStorage.getItem(FREE_CASTING_TRIAL_KEY).then(value => {
      if (!mounted) return;
      const parsed = parseFreeCastingTrialRecord(value);
      if (!parsed) {
        const expiredRecord = { hasStarted: true, remainingMs: 0 };
        publishRecord(expiredRecord);
        setError('Your free access record could not be read. FrameCast has kept it from resetting.');
      } else {
        publishRecord(parsed);
      }
      setLoaded(true);
    }).catch(() => {
      if (!mounted) return;
      setError('FrameCast could not read your free access time. Check your phone storage, then reopen the app.');
      setLoaded(true);
    });
    return () => { mounted = false; };
  }, [publishRecord]);

  useEffect(() => {
    if (loaded) reconcileRef.current();
  }, [loaded]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      appStateRef.current = state;
      reconcileRef.current();
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      const activeSince = activeSinceRef.current;
      if (activeSince === null) return;
      const now = Date.now();
      const nextRemaining = remainingFreeCastingTrialMs(recordRef.current, activeSince, now);
      setRemainingMs(nextRemaining);
      if (nextRemaining <= 0) {
        activeSinceRef.current = null;
        const expiredRecord = { hasStarted: true, remainingMs: 0 };
        publishRecord(expiredRecord);
        setIsCountingDown(false);
        lastSaveAtRef.current = now;
        void persistRecord(expiredRecord).catch(stopForStorageError);
        return;
      }
      if (now - lastSaveAtRef.current >= TRIAL_SAVE_INTERVAL_MS) {
        const checkpoint = { hasStarted: true, remainingMs: nextRemaining };
        publishRecord(checkpoint);
        activeSinceRef.current = now;
        lastSaveAtRef.current = now;
        void persistRecord(checkpoint).catch(stopForStorageError);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [persistRecord, publishRecord, stopForStorageError]);

  const setSessionConnected = useCallback((connected: boolean, premium: boolean) => {
    connectedRef.current = connected;
    premiumRef.current = premium;
    reconcileRef.current();
  }, []);

  const expired = hasStarted && remainingMs <= 0;
  const available = Platform.OS !== 'web' && loaded && !error && remainingMs > 0;
  const value = useMemo(() => ({
    loaded,
    hasStarted,
    isCountingDown,
    remainingMs,
    expired,
    available,
    error,
    setSessionConnected,
  }), [available, error, expired, hasStarted, isCountingDown, loaded, remainingMs, setSessionConnected]);

  return (
    <FreeCastingTrialContext.Provider value={value}>
      {children}
    </FreeCastingTrialContext.Provider>
  );
}

export function useFreeCastingTrial() {
  const context = useContext(FreeCastingTrialContext);
  if (!context) throw new Error('useFreeCastingTrial must be used within FreeCastingTrialProvider');
  return context;
}
