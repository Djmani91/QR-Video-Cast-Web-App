export function shouldOfferPhoneConversion(
  platform: string,
  kind: 'video' | 'image' | undefined,
  error: string,
  alreadyPrepared: boolean,
): boolean {
  if (platform !== 'android' || kind !== 'video' || alreadyPrepared) return false;
  return /does not support this video format|could not decode this video|has not decoded a picture|unsupported.*codec/i.test(error);
}

export function getTemporaryMediaUris(media: {
  uri: string;
  temporaryCopy?: boolean;
  compatibleUri?: string;
}): string[] {
  return [
    ...(media.temporaryCopy ? [media.uri] : []),
    ...(media.compatibleUri ? [media.compatibleUri] : []),
  ];
}
