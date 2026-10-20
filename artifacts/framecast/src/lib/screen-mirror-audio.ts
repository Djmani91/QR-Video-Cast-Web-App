const SCREEN_AUDIO_SAMPLE_RATE = 48_000;
const TARGET_JITTER_SECONDS = 0.06;
const MAX_AUDIO_QUEUE_SECONDS = 0.4;

export type ScreenMirrorAudioPlayer = {
  push(packet: unknown): void;
  close(): void;
};

export function createScreenMirrorAudioPlayer(): ScreenMirrorAudioPlayer | null {
  const AudioContextConstructor = window.AudioContext
    ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextConstructor) return null;

  let context: AudioContext;
  try {
    context = new AudioContextConstructor({ latencyHint: 'interactive', sampleRate: SCREEN_AUDIO_SAMPLE_RATE });
  } catch {
    try {
      context = new AudioContextConstructor({ latencyHint: 'interactive' });
    } catch {
      return null;
    }
  }

  let nextStartTime = 0;
  let closed = false;
  const resume = () => {
    if (context.state === 'suspended') {
      nextStartTime = 0;
      void context.resume().catch(() => undefined);
    }
  };
  window.addEventListener('keydown', resume);
  window.addEventListener('pointerdown', resume);
  resume();

  return {
    push(packet) {
      if (closed || !(packet instanceof ArrayBuffer) || packet.byteLength < 2) return;
      if (context.state === 'suspended') {
        resume();
        return;
      }
      const sampleCount = Math.floor(packet.byteLength / 2);
      const now = context.currentTime;
      if (nextStartTime - now > MAX_AUDIO_QUEUE_SECONDS) return;

      const audioBuffer = context.createBuffer(1, sampleCount, SCREEN_AUDIO_SAMPLE_RATE);
      const channel = audioBuffer.getChannelData(0);
      const view = new DataView(packet);
      for (let index = 0; index < sampleCount; index += 1) {
        channel[index] = view.getInt16(index * 2, true) / 32768;
      }

      const source = context.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(context.destination);
      const startAt = Math.max(nextStartTime, now + TARGET_JITTER_SECONDS);
      nextStartTime = startAt + audioBuffer.duration;
      source.start(startAt);
      source.onended = () => source.disconnect();
    },
    close() {
      if (closed) return;
      closed = true;
      window.removeEventListener('keydown', resume);
      window.removeEventListener('pointerdown', resume);
      void context.close().catch(() => undefined);
    },
  };
}
