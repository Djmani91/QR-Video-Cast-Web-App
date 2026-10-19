import { useEffect, useRef } from 'react';

export type YouTubePlayerApi = {
  destroy: () => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState: () => number;
  getVolume: () => number;
  isMuted: () => boolean;
  mute: () => void;
  pauseVideo: () => void;
  playVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  setVolume: (volume: number) => void;
  stopVideo: () => void;
  unMute: () => void;
};

type PlayerEvent<T = number> = { target: YouTubePlayerApi; data: T };
type PlayerOptions = {
  videoId: string;
  playerVars: Record<string, number | string>;
  events: {
    onReady: (event: PlayerEvent<undefined>) => void;
    onStateChange: (event: PlayerEvent) => void;
    onError: (event: PlayerEvent) => void;
    onAutoplayBlocked: () => void;
  };
};

type YouTubeApi = { Player: new (element: HTMLElement, options: PlayerOptions) => YouTubePlayerApi };

declare global {
  interface Window {
    YT?: YouTubeApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<void> | null = null;

function loadYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve();
  if (apiPromise) return apiPromise;

  apiPromise = new Promise<void>((resolve, reject) => {
    window.onYouTubeIframeAPIReady = resolve;
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.onerror = () => {
      apiPromise = null;
      reject(new Error('The YouTube player could not be loaded.'));
    };
    document.head.appendChild(script);
  });
  return apiPromise;
}

export function YouTubePlayer({
  videoId,
  className,
  onReady,
  onStateChange,
  onError,
  onAutoplayBlocked,
}: {
  videoId: string;
  className: string;
  onReady: (player: YouTubePlayerApi) => void;
  onStateChange: (player: YouTubePlayerApi, state: number) => void;
  onError: (code: number) => void;
  onAutoplayBlocked: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const callbacksRef = useRef({ onReady, onStateChange, onError, onAutoplayBlocked });
  callbacksRef.current = { onReady, onStateChange, onError, onAutoplayBlocked };

  useEffect(() => {
    let disposed = false;
    let player: YouTubePlayerApi | null = null;

    void loadYouTubeApi().then(() => {
      if (disposed || !containerRef.current || !window.YT) return;
      player = new window.YT.Player(containerRef.current, {
        videoId,
        playerVars: {
          controls: 1,
          enablejsapi: 1,
          fs: 1,
          origin: window.location.origin,
          playsinline: 1,
          rel: 0,
        },
        events: {
          onReady: (event) => callbacksRef.current.onReady(event.target),
          onStateChange: (event) => callbacksRef.current.onStateChange(event.target, event.data),
          onError: (event) => callbacksRef.current.onError(event.data),
          onAutoplayBlocked: () => callbacksRef.current.onAutoplayBlocked(),
        },
      });
    }).catch(() => callbacksRef.current.onError(-1));

    return () => {
      disposed = true;
      player?.destroy();
    };
  }, [videoId]);

  return <div ref={containerRef} className={className} aria-label="YouTube video player" />;
}
