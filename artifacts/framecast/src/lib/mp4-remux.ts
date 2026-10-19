import { createFile } from 'mp4box';
import { orientationFromTrack, type VideoOrientation } from './media-orientation';

type Mp4Track = {
  id: number;
  video?: { width: number; height: number };
  matrix?: ArrayLike<number>;
  audio?: unknown;
};

type Mp4Info = {
  isFragmented: boolean;
  tracks: Mp4Track[];
};

type Mp4Segmenter = {
  onReady: ((info: Mp4Info) => void) | null;
  onError: ((message: string) => void) | null;
  onSegment: ((id: number, user: unknown, buffer: ArrayBuffer) => void) | null;
  appendBuffer: (buffer: ArrayBuffer & { fileStart: number }) => number;
  setSegmentOptions: (id: number, user: unknown, options: { nbSamples: number; rapAlignement: boolean }) => void;
  initializeSegmentation: () => { buffer: ArrayBuffer } | Array<{ buffer: ArrayBuffer }>;
  getTrackById: (id: number) => { tkhd: { matrix: number[]; width: number; height: number } };
  start: () => void;
  flush: () => void;
};

type RemuxFile = {
  size: number;
  slice(start: number, end: number): Blob;
};

type RemuxChannel = {
  readyState: string;
  send(data: string | ArrayBuffer | ArrayBufferView): void;
};

export type RemuxSendResult = 'sent' | 'already-fragmented' | 'unsupported' | 'cancelled';

const INPUT_CHUNK_BYTES = 256 * 1024;
const DATA_CHANNEL_CHUNK_BYTES = 32 * 1024;
const MAX_INDEX_SCAN_BYTES = 64 * 1024 * 1024;
const MAX_BUFFERED_FALLBACK_BYTES = 128 * 1024 * 1024;

export async function remuxAndSendMp4({
  file,
  channel,
  name,
  originalSize,
  isCancelled,
  waitForBuffer,
  onProgress,
  onOrientation,
}: {
  file: RemuxFile;
  channel: RemuxChannel;
  name: string;
  originalSize: number;
  isCancelled: () => boolean;
  waitForBuffer: () => Promise<void>;
  onProgress: (bytes: number) => void;
  onOrientation?: (orientation: VideoOrientation) => void;
}): Promise<RemuxSendResult> {
  const parser = createFile() as unknown as Mp4Segmenter;
  const outputQueue: ArrayBuffer[] = [];
  const state: { value: 'pending' | 'converted' | 'already-fragmented' | 'unsupported' } = { value: 'pending' };
  let committed = false;
  let parserError = '';
  let inputOffset = 0;
  const queueBuffer = (buffer: ArrayBuffer) => {
    for (let offset = 0; offset < buffer.byteLength; offset += DATA_CHANNEL_CHUNK_BYTES) {
      outputQueue.push(buffer.slice(offset, Math.min(offset + DATA_CHANNEL_CHUNK_BYTES, buffer.byteLength)));
    }
  };

  const drainOutput = async () => {
    while (outputQueue.length > 0) {
      await waitForBuffer();
      if (isCancelled() || channel.readyState !== 'open') return false;
      channel.send(outputQueue.shift()!);
    }
    return true;
  };

  parser.onReady = (info) => {
    if (state.value !== 'pending') return;
    const videoTrack = info.tracks.find((track) => track.video);
    const orientation = orientationFromTrack(videoTrack);
    onOrientation?.(orientation);
    if (info.isFragmented) {
      state.value = 'already-fragmented';
      return;
    }
    if (!info.tracks.some((track) => track.video)) {
      state.value = 'unsupported';
      return;
    }
    try {
      for (const track of info.tracks.filter((item) => item.video || item.audio)) {
        if (track.video && orientation.rotation) {
          // Render rotation explicitly at the receiver. Some TV MediaSource players
          // ignore this matrix, while others apply it: an identity output avoids
          // both sideways playback and accidental double rotation.
          const header = parser.getTrackById(track.id).tkhd;
          header.matrix = [65536, 0, 0, 0, 65536, 0, 0, 0, 1073741824];
          header.width = track.video.width * 65536;
          header.height = track.video.height * 65536;
        }
        parser.setSegmentOptions(track.id, null, { nbSamples: 30, rapAlignement: true });
      }
      const initSegments = parser.initializeSegmentation();
      const buffers = Array.isArray(initSegments) ? initSegments.map((segment) => segment.buffer) : [initSegments.buffer];
      if (buffers.length === 0) {
        state.value = 'unsupported';
        return;
      }
      if (channel.readyState !== 'open' || isCancelled()) {
        state.value = 'unsupported';
        return;
      }
      channel.send(JSON.stringify({
        framecast: 'metadata',
        name,
        mimeType: 'video/mp4',
        kind: 'video',
        size: originalSize,
        sizeUnknown: true,
        streamCandidate: true,
        ...orientation,
        orientationNormalized: true,
      }));
      committed = true;
      state.value = 'converted';
      buffers.forEach(queueBuffer);
      parser.start();
    } catch (error) {
      parserError = error instanceof Error ? error.message : 'Could not prepare this MP4 for streaming.';
      state.value = committed ? 'converted' : 'unsupported';
    }
  };

  parser.onSegment = (_trackId, _user, segment) => {
    if (state.value === 'converted') queueBuffer(segment);
  };

  parser.onError = (message) => {
    parserError = message || 'This file is not a supported MP4 video.';
    if (!committed) state.value = 'unsupported';
  };

  const maxIndexScan = file.size <= MAX_BUFFERED_FALLBACK_BYTES
    ? file.size
    : MAX_INDEX_SCAN_BYTES;

  while (inputOffset < file.size) {
    if (isCancelled() || channel.readyState !== 'open') return 'cancelled';
    const end = Math.min(inputOffset + INPUT_CHUNK_BYTES, file.size);
    const chunk = await file.slice(inputOffset, end).arrayBuffer() as ArrayBuffer & { fileStart: number };
    chunk.fileStart = inputOffset;
    try {
      parser.appendBuffer(chunk);
    } catch (error) {
      parserError = error instanceof Error ? error.message : 'Could not read this MP4 video.';
      if (committed) throw new Error('The phone could not finish preparing this video for streaming.');
      return 'unsupported';
    }
    inputOffset = end;
    onProgress(inputOffset);

    if (state.value === 'unsupported' || state.value === 'already-fragmented') return state.value;
    if (state.value === 'converted' && !(await drainOutput())) return 'cancelled';
    if (state.value === 'pending' && inputOffset >= maxIndexScan && file.size > maxIndexScan) {
      return 'unsupported';
    }
  }

  if (state.value === 'pending') parser.flush();
  if (state.value === 'unsupported' || state.value === 'already-fragmented' || state.value === 'pending') return state.value === 'pending' ? 'unsupported' : state.value;
  if (parserError) throw new Error('The phone could not finish preparing this video for streaming.');
  if (!(await drainOutput())) return 'cancelled';
  await waitForBuffer();
  if (isCancelled() || channel.readyState !== 'open') return 'cancelled';
  channel.send(JSON.stringify({ framecast: 'complete' }));
  return 'sent';
}
