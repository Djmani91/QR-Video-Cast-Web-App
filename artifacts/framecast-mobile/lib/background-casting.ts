import { NativeEventEmitter, NativeModules, PermissionsAndroid, Platform } from 'react-native';

type Playback = { title: string; paused: boolean; position: number; duration: number };
type BackgroundModule = {
  start(title: string, paused: boolean, position: number, duration: number): Promise<void>;
  update(title: string, paused: boolean, position: number, duration: number): void;
  stop(): Promise<void>;
  addListener(name: string): void;
  removeListeners(count: number): void;
};

const native = Platform.OS === 'android'
  ? NativeModules.FrameCastBackground as BackgroundModule | undefined
  : undefined;
const events = native ? new NativeEventEmitter(native) : null;
const tasks = new Set<() => void>();
export const backgroundCastingAvailable = Boolean(native);

function finishTasks() {
  for (const finish of tasks) finish();
  tasks.clear();
}
events?.addListener('FrameCastBackgroundStopped', finishTasks);

// A running headless task keeps Android's React Native timers active while the
// foreground service serves the paired TV. It ends on explicit disconnect.
export function backgroundCastingTask(): Promise<void> {
  return new Promise(resolve => tasks.add(resolve));
}

export async function startBackgroundCasting(playback: Playback) {
  if (!native) throw new Error('Background casting requires the installed FrameCast Android APK, not Expo Go.');
  if (Number(Platform.Version) >= 33) {
    const permission = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
    if (permission !== PermissionsAndroid.RESULTS.GRANTED) {
      throw new Error('Allow notifications to show the background casting controls. You can still cast with FrameCast open.');
    }
  }
  await native.start(playback.title, playback.paused, playback.position, playback.duration);
}

export function updateBackgroundCasting(playback: Playback) {
  native?.update(playback.title, playback.paused, playback.position, playback.duration);
}

export async function stopBackgroundCasting() {
  finishTasks();
  await native?.stop();
}

export function onBackgroundControl(listener: (action: string) => void) {
  const subscription = events?.addListener('FrameCastRemoteControl', listener);
  return () => subscription?.remove();
}

export function onBackgroundStopped(listener: () => void) {
  const subscription = events?.addListener('FrameCastBackgroundStopped', listener);
  return () => subscription?.remove();
}
