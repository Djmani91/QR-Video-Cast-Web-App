import type { DetectedVideoSource } from '@/lib/video-browser-detector';

export type VideoBrowserProps = {
  initialUrl: string;
  onClose: () => void;
  onPlayVideo: (url: string) => void;
};

export function VideoBrowser(_props: VideoBrowserProps) {
  return null;
}

export type { DetectedVideoSource };
