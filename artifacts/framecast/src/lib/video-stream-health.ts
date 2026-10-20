import { phoneStreamProfile, VIDEO_QUALITY_HEIGHTS, type VideoStreamProfile } from './video-stream-quality.ts';

export type VideoStats = {
  timestamp: number; frames: number; dropped: number; freezes: number;
  encodeTime: number; reason: string; width: number; height: number;
  availableBitrate: number;
};
export type StreamHealth = {
  encodedFps: number; receivedFps: number | null;
  width: number; height: number; limitedBy: string;
};
const valid = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0;
const number = (n: unknown) => valid(n) ? n : 0;

export function readVideoStats(report: RTCStatsReport, direction: 'inbound' | 'outbound'): VideoStats | null {
  let found: VideoStats | null = null;
  let selectedPair = '';
  let nominatedBitrate = 0;
  const pairs = new Map<string, number>();
  report.forEach(row => {
    if (row.type === 'transport' && row.selectedCandidatePairId) selectedPair = String(row.selectedCandidatePairId);
    if (row.type === 'candidate-pair' && row.state === 'succeeded') {
      const bitrate = number(row.availableOutgoingBitrate);
      pairs.set(String(row.id), bitrate);
      if (row.nominated || row.selected) nominatedBitrate = bitrate;
    }
    const frames = direction === 'inbound' ? row.framesDecoded : row.framesEncoded;
    if (row.type !== `${direction}-rtp` || row.isRemote || row.kind === 'audio' || row.mediaType === 'audio' || !valid(frames) || !valid(row.timestamp)) return;
    found = {
      timestamp: row.timestamp, frames, dropped: number(row.framesDropped), freezes: number(row.freezeCount),
      encodeTime: number(row.totalEncodeTime), reason: String(row.qualityLimitationReason ?? ''),
      width: number(row.frameWidth), height: number(row.frameHeight),
      availableBitrate: 0,
    };
  });
  // Use the selected connection, never an unrelated candidate's estimate.
  if (found && direction === 'outbound') {
    (found as VideoStats).availableBitrate = selectedPair ? pairs.get(selectedPair) ?? 0 : nominatedBitrate;
  }
  return found;
}

type Source = {
  state(): { paused: boolean; ended: boolean };
  sourceVersion(): number;
  profile(): VideoStreamProfile;
  maxHeight(): number;
  metrics(): { drawnFrames: number; droppedFrames: number; totalFrames: number; drawTime?: number };
  setResolutionCeiling(height: number): void;
};

const browserClock = {
  now: () => Date.now(),
  setInterval: (callback: () => void, delay: number) => window.setInterval(callback, delay),
  clearInterval: (timer: number) => window.clearInterval(timer),
};

/** Adapt from real cumulative counters, never from the file's playback clock.
 * Lower resolution before sacrificing motion; require sustained healthy TV
 * decoding before increasing quality. UHD additionally needs measured rendering
 * headroom, actual current-resolution TV decoding, and spare link capacity.
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
  let highHeadroom = 0, underTarget = 0, unsupportedAbove = Infinity;
  let lastHeight = source.profile().height;

  async function poll() {
    if (!active || busy) return;
    if (source.state().paused || source.state().ended) {
      previous = previousReceiver = null;
      good = bad = highHeadroom = underTarget = 0;
      return;
    }
    busy = true;
    try {
      const report = await peer.getStats();
      if (!active) return;
      if (source.state().paused || source.state().ended) {
        previous = previousReceiver = null;
        good = bad = highHeadroom = underTarget = 0;
        return;
      }
      const video = readVideoStats(report, 'outbound');
      if (!video) return; // Older implementations may not expose encoder stats.
      if (source.sourceVersion() !== version) {
        version = source.sourceVersion();
        previous = previousReceiver = null;
        good = bad = highHeadroom = underTarget = upgradeAfter = 0;
        unsupportedAbove = Infinity;
        const changed = lastHeight !== source.profile().height;
        lastHeight = source.profile().height;
        if (changed) options.onProfileChanged();
      }
      if (source.profile().height !== lastHeight) {
        // The renderer may independently reject a UHD canvas and fall back.
        lastHeight = source.profile().height;
        previous = previousReceiver = null;
        good = bad = highHeadroom = underTarget = 0;
        options.onProfileChanged();
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
      const renderMeasured = valid(metrics.drawTime) && valid(before.metrics.drawTime);
      const renderMs = renderMeasured && drawn > 0
        ? Math.max(0, metrics.drawTime! - before.metrics.drawTime!) / drawn : Infinity;
      const receivedFps = rx && oldRx && rx.timestamp > oldRx.timestamp && rx.frames >= oldRx.frames
        ? (rx.frames - oldRx.frames) * 1000 / (rx.timestamp - oldRx.timestamp) : null;
      const receiverDropped = rx && oldRx ? Math.max(0, rx.dropped - oldRx.dropped) : 0;
      const receiverFrames = rx && oldRx ? Math.max(0, rx.frames - oldRx.frames) : 0;
      const tvBusy = receivedFps !== null && encodedFps >= 10
        && (receivedFps < encodedFps * 0.8 || rx!.freezes > oldRx!.freezes
          || receiverDropped > Math.max(2, receiverFrames * 0.05));
      const phoneBusy = video.reason === 'cpu' || (total > 0 && dropped / total > 0.08)
        || (drawn >= 10 && encoded < drawn * 0.8) || encodeMs * encodedFps > 800
        || (renderMeasured && drawn >= 10 && (encodeMs + renderMs) * Math.max(encodedFps, drawn / seconds) > 800)
        || (total > 0 && drawn < Math.min(total, source.profile().frameRate * seconds) * 0.8);
      const limitedBy = video.reason === 'bandwidth' ? 'Wi-Fi' : phoneBusy ? 'phone' : tvBusy ? 'TV reception' : '';
      if (limitedBy) { bad++; good = 0; } else { good++; bad = 0; }
      const current = source.profile();
      const height = current.height;
      const index = VIDEO_QUALITY_HEIGHTS.findIndex(value => value === height);
      const lower = VIDEO_QUALITY_HEIGHTS[Math.max(0, index - 1)];
      const next = VIDEO_QUALITY_HEIGHTS[Math.min(VIDEO_QUALITY_HEIGHTS.length - 1, index + 1)];
      const nextProfile = phoneStreamProfile(3840, 2160, next);
      const dimensionsMatch = video.width >= current.width * 0.95 && video.height >= height * 0.95
        && rx !== null && rx.width >= video.width * 0.95 && rx.height >= video.height * 0.95;
      const predictedWorkMs = (encodeMs + renderMs) * (nextProfile.width * nextProfile.height) / (current.width * current.height);
      const spareCapacity = video.availableBitrate >= nextProfile.maxBitrate * 1.2;
      const receiverSteady = receivedFps !== null && receivedFps >= encodedFps * 0.95 && receiverDropped === 0;
      const higherSafe = !limitedBy && dimensionsMatch && spareCapacity && renderMeasured
        && drawn / seconds >= 15 && encodedFps >= 15 && encoded >= drawn * 0.95
        && dropped === 0 && receiverSteady && predictedWorkMs < 14;
      highHeadroom = higherSafe ? highHeadroom + 1 : 0;
      const downscaled = height > 1080 && video.width > 0 && video.height > 0
        && (video.width < current.width * 0.9 || video.height < height * 0.9
          || (rx !== null && rx.width > 0 && rx.height > 0 && (rx.width < video.width * 0.9 || rx.height < video.height * 0.9)));
      underTarget = downscaled ? underTarget + 1 : 0;
      const severe = height > 1080 && ((drawn >= 10 && encoded < drawn * 0.5)
        || (receivedFps !== null && encodedFps >= 10 && receivedFps < encodedFps * 0.5)
        || (rx !== null && oldRx !== null && rx.freezes > oldRx.freezes));
      let target = height;
      if (underTarget >= 3) {
        // The negotiated encoder/decoder did not deliver the requested tier.
        // Stop retrying that tier for this source instead of labeling it UHD.
        unsupportedAbove = lower;
        target = lower;
        upgradeAfter = video.timestamp + 120_000;
      } else if ((bad >= 2 || severe) && height > 540) {
        target = severe ? 1080 : lower;
        // Do not oscillate back to the expensive setting every few seconds.
        upgradeAfter = video.timestamp + (height > 1080 ? 120_000 : 60_000);
      } else if (good >= 6 && receivedFps !== null && video.timestamp >= upgradeAfter
        && next <= Math.min(source.maxHeight(), unsupportedAbove)
        && (next <= 1080 || highHeadroom >= (next === 2160 ? 15 : 12))) {
        target = next;
        upgradeAfter = video.timestamp + 12_000;
      }
      if (target !== height) {
        source.setResolutionCeiling(target);
        options.onProfileChanged();
        lastHeight = source.profile().height;
        good = bad = highHeadroom = underTarget = 0;
        previous = previousReceiver = null;
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
        width: number(row.width), height: number(row.height), encodeTime: 0, reason: '', availableBitrate: 0,
      };
      receivedAt = clock.now();
    },
    stop() { active = false; clock.clearInterval(timer); },
  };
}
