import { useEffect, useRef, useState, type RefObject } from 'react';
import { startRotatedVideoCanvas } from '../lib/rotated-video-canvas';

export function RotatedVideoCanvas({
  videoRef, rotation, fitMode, encodedWidth, encodedHeight, sourceKey, onFailure,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  rotation: number;
  fitMode: 'cover' | 'contain';
  encodedWidth?: number;
  encodedHeight?: number;
  sourceKey: string;
  onFailure: (message: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failure, setFailure] = useState('');
  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    setFailure('');
    return startRotatedVideoCanvas(video, canvas, {
      rotation, fitMode, encodedWidth, encodedHeight,
      onError(message) { setFailure(message); onFailure(message); },
    });
  }, [videoRef, rotation, fitMode, encodedWidth, encodedHeight, sourceKey, onFailure]);

  return (
    <>
      <canvas ref={canvasRef} className="tv-corrected-video-canvas" aria-label="Video playing upright from the guest phone" data-testid="canvas-tv-upright-video" />
      {failure && <div className="tv-corrected-video-error" role="alert">{failure}</div>}
    </>
  );
}
