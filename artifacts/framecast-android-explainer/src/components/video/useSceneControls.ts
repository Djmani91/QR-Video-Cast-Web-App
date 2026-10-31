import { useCallback, useMemo, useState } from 'react';

const REPEAT_SUFFIX = /_r[12]$/;

export function stripRepeatSuffix(key: string) {
  return key.replace(REPEAT_SUFFIX, '');
}

function rotateDurations(base: Record<string, number>, index: number) {
  const keys = Object.keys(base);
  const result: Record<string, number> = {};
  keys.forEach((_, offset) => {
    const key = keys[(index + offset) % keys.length];
    result[key] = base[key];
  });
  return result;
}

export function useSceneControls(baseDurations: Record<string, number>) {
  const keys = useMemo(() => Object.keys(baseDurations), [baseDurations]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [locked, setLocked] = useState(false);
  const [paused, setPaused] = useState(false);
  const [mountKey, setMountKey] = useState(0);
  const [tick, setTick] = useState(0);

  const durations = useMemo(() => {
    if (locked) {
      const key = keys[activeIndex];
      return { [`${key}_r1`]: baseDurations[key], [`${key}_r2`]: baseDurations[key] };
    }
    return rotateDurations(baseDurations, activeIndex);
  }, [activeIndex, baseDurations, keys, locked]);

  const totalDuration = useMemo(() => Object.values(baseDurations).reduce((sum, d) => sum + d, 0), [baseDurations]);
  const activeStartTime = useMemo(() => keys.slice(0, activeIndex).reduce((sum, key) => sum + baseDurations[key], 0), [activeIndex, baseDurations, keys]);
  const onSceneChange = useCallback((rawKey: string) => {
    const index = keys.indexOf(stripRepeatSuffix(rawKey));
    if (index >= 0) setActiveIndex(index);
    setTick((value) => value + 1);
  }, [keys]);
  const jumpTo = useCallback((index: number) => {
    setActiveIndex(index);
    setPaused(false);
    setMountKey((value) => value + 1);
    setTick((value) => value + 1);
  }, []);
  const toggleLock = useCallback(() => {
    setLocked((value) => !value);
    setPaused(false);
    setMountKey((value) => value + 1);
    setTick((value) => value + 1);
  }, []);
  const togglePause = useCallback(() => setPaused((value) => !value), []);

  return {
    keys, activeIndex, locked, paused, mountKey, tick, durations,
    activeDuration: baseDurations[keys[activeIndex]] ?? 0,
    activeStartTime, totalDuration, onSceneChange, jumpTo, toggleLock, togglePause,
  };
}
