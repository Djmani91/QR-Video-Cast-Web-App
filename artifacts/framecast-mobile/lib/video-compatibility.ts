export function isUnsupportedTvVideoError(error: string): boolean {
  return /does not support this video format|could not decode this video|has not decoded a picture|unsupported.*codec/i.test(error);
}

export function getUnsupportedTvVideoHelp(error: string): string {
  const detail = error.trim() || 'The TV could not decode this video.';
  return [
    `TV message: ${detail}`,
    'The TV did not identify the exact video codec. For wider TV support, convert it to an MP4 with H.264/AVC video and AAC audio, then return to FrameCast and select the converted copy.',
    'CloudConvert is a third-party service. FrameCast will not upload your video. If you choose to upload it to CloudConvert, that service receives and processes it; do not upload private videos.',
  ].join('\n\n');
}

export function getTemporaryMediaUris(media: {
  uri: string;
  temporaryCopy?: boolean;
}): string[] {
  return media.temporaryCopy ? [media.uri] : [];
}
