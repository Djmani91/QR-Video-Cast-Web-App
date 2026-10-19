import type { VideoStreamProfile } from './video-stream-quality.ts';

export type VideoStats = {
  timestamp: number; frames: number; dropped: number; freezes: number;
  encodeTime: number; reason: string; width: number; height: number;
};
export type StreamHealth = {
  encodedFps: number; receivedFps: number | null;
  width: number; height: number; limitedBy: string;
};
const valid = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0;
const number = (n: unknown) => valid(n) ? n : 0;

export function readVideoStats(report: RTCStatsReport, direction: 'inbound' | 'outbound'): VideoStats | null {
  let found: VideoStats | null = null;
  report.forEach(row => {
    const frames = direction === 'inbound' ? row.framesDecoded : row.framesEncoded;
    if (row.type !== `${direction}-rtp` || row.isRemote || row.kind === 'audio' || row.mediaType === 'audio' || !valid(frames) || !valid(row.timestamp)) return;
    found = {
      timestamp: row.timestamp, frames, dropped: number(row.framesDropped), freezes: number(row.freezeCount),
      encodeTime: number(row.totalEncodeTime), reason: String(row.qualityLimitationReason ?? ''),
      width: number(row.frameWidth), height: number(row.frameHeight),
    };
  });
  return found;
}

type Source = {
  state(): { paused: boolean; ended: boolean };
  sourceVersion(): number;
  profile(): VideoStreamProfile;
  maxHeight(): number;
  metrics(): { drawnFrames: number; droppedFrames: number; totalFrames: number };
  setResolutionCeiling(height: number): void;
};

const browserClock = {
  now: () => Date.now(),
  setInterval: (callback: () => void, delay: number) => window.setInterval(callback, delay),
  clearInterval: (timer: number) => window.clearInterval(timer),
};

/** Adapt from real cumulative counters, never from the file's playback clock.
 * Lower resolution before sacrificing motion; require sustained healthy TV
 * decoding before enabling 1080p. No peer/track replacement or media upload.
 */
export function monitorVideoStream(peer: Pick<RTCPeerConnection, 'getStats'>, source: Source, options: {
  onSample: (sample: StreamHealth) => void;
  onProfileChanged: () => void;
}, clock = browserClock) {
  let active = true, busy = false, warned = false;
  let version = source.sourceVersion();
  let previous: { video: VideoStats; metrics: ReturnType<Source['metrics']> } | null = null;
  let receiver: VideoStats | null = null, previousReceiver: VideoStats | null = null;
  let receivedAt = -Infinity, good = 0, bad = 0, upgradeAfter = 0;

  async function poll() {
    if (!active || busy) return;
    if (source.state().paused || source.state().ended) {
      previous = previousReceiver = null;
      good = bad = 0;
      return;
    }
    busy = true;
    try {
      const report = await peer.getStats();
      if (!active) return;
      if (source.state().paused || source.state().ended) {
        previous = previousReceiver = null;
        good = bad = 0;
        return;
      }
      const video = readVideoStats(report, 'outbound');
      if (!video) return; // Older implementations may not expose encoder stats.
      if (source.sourceVersion() !== version) {
        version = source.sourceVersion();
        previous = previousReceiver = null;
        good = bad = upgradeAfter = 0;
      }
      const metrics = source.metrics();
      const before = previous;
      previous = { video, metrics };
      const rx = clock.now() - receivedAt < 5000 ? receiver : null;
      const oldRx = previousReceiver;
      previousReceiver = rx;
      if (!before || video.timestamp <= before.video.timestamp || video.frames < before.video.frames) return;
      const seconds = (video.timestamp - before.video.timestamp) / 1000;
      const encoded = video.frames - before.video.frames;
      const encodedFps = encoded / seconds;
      const drawn = Math.max(0, metrics.drawnFrames - before.metrics.drawnFrames);
      const total = metrics.totalFrames - before.metrics.totalFrames;
      const dropped = Math.max(0, metrics.droppedFrames - before.metrics.droppedFrames);
      const encodeMs = encoded > 0 ? Math.max(0, video.encodeTime - before.video.encodeTime) * 1000 / encoded : 0;
      const receivedFps = rx && oldRx && rx.timestamp > oldRx.timestamp && rx.frames >= oldRx.frames
        ? (rx.frames - oldRx.frames) * 1000 / (rx.timestamp - oldRx.timestamp) : null;
      const tvBusy = receivedFps !== null && encodedFps >= 10
        && (receivedFps < encodedFps * 0.8 || (rx!.freezes > oldRx!.freezes));
      const phoneBusy = video.reason === 'cpu' || (total > 0 && dropped / total > 0.08)
        || (drawn >= 10 && encoded < drawn * 0.8) || encodeMs * encodedFps > 800;
      const limitedBy = video.reason === 'bandwidth' ? 'Wi-Fi' : phoneBusy ? 'phone' : tvBusy ? 'TV reception' : '';
      if (limitedBy) { bad++; good = 0; } else { good++; bad = 0; }
      const height = source.profile().height;
      let target = height;
      if (bad >= 2 && height > 540) {
        target = height > 720 ? 720 : 540;
        // Do not oscillate back to the expensive setting every few seconds.
        upgradeAfter = video.timestamp + 60_000;
      } else if (good >= 6 && receivedFps !== null && video.timestamp >= upgradeAfter && height < source.maxHeight()) {
        target = height < 720 ? 720 : 1080;
        upgradeAfter = video.timestamp + 12_000;
      }
      if (target !== height) {
        source.setResolutionCeiling(target);
        options.onProfileChanged();
        good = bad = 0;
      }
      options.onSample({ encodedFps, receivedFps, width: video.width, height: video.height, limitedBy });
    } catch (error) {
      if (active && !warned) {
        console.warn('Video performance statistics unavailable; keeping the current direct stream.', error);
        warned = true;
      }
    } finally { busy = false; }
  }
  const timer = clock.setInterval(() => { void poll(); }, 2000);
  return {
    poll,
    receive(value: unknown) {
      if (!active || !value || typeof value !== 'object') return;
      const row = value as Partial<VideoStats>;
      if (!valid(row.timestamp) || !valid(row.frames) || (receiver && row.timestamp <= receiver.timestamp)) return;
      receiver = {
        timestamp: row.timestamp, frames: row.frames, dropped: number(row.dropped), freezes: number(row.freezes),
        width: number(row.width), height: number(row.height), encodeTime: 0, reason: '',
      };
      receivedAt = clock.now();
    },
    stop() { active = false; clock.clearInterval(timer); },
  };
}
