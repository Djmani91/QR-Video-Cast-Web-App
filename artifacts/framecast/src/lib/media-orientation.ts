export type VideoOrientation = {
  rotation: number;
  encodedWidth: number;
  encodedHeight: number;
  orientationNormalized?: boolean;
};

export function normalizeRotation(degrees: number): number {
  if (!Number.isFinite(degrees)) return 0;
  return ((Math.round(degrees / 90) * 90) % 360 + 360) % 360;
}

export function orientationFromTrack(track?: { matrix?: ArrayLike<number>; video?: { width: number; height: number } }): VideoOrientation {
  const matrix = track?.matrix;
  return {
    rotation: matrix && matrix.length >= 5 ? normalizeRotation(Math.atan2(matrix[1], matrix[0]) * 180 / Math.PI) : 0,
    encodedWidth: track?.video?.width || 0,
    encodedHeight: track?.video?.height || 0,
  };
}

/** Avoid rotating twice when a browser already honors an original file's matrix. */
export function requiredVideoRotation(source: VideoOrientation | null, width: number, height: number): number {
  if (!source || !width || !height) return 0;
  const rotation = normalizeRotation(source.rotation);
  if (source.orientationNormalized) return rotation;
  if (rotation !== 90 && rotation !== 270) return 0;
  if (!source.encodedWidth || !source.encodedHeight) return 0;
  const rawRatio = source.encodedWidth / source.encodedHeight;
  const renderedRatio = width / height;
  return Math.abs(renderedRatio - rawRatio) < Math.abs(renderedRatio - 1 / rawRatio) ? rotation : 0;
}
