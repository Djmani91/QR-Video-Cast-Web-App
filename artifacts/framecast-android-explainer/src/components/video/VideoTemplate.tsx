import { useEffect, useRef } from 'react';
import type { ComponentType } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  VideoCanvas,
  VideoPausedContext,
  type VideoAspectRatio,
  useVideoPlayer,
} from '@/lib/video';
import { Scene1 } from './video_scenes/Scene1';
import { Scene2 } from './video_scenes/Scene2';
import { Scene3 } from './video_scenes/Scene3';
import { Scene4 } from './video_scenes/Scene4';
import { Scene5 } from './video_scenes/Scene5';
import { Scene6 } from './video_scenes/Scene6';
import { Scene7 } from './video_scenes/Scene7';
import { Scene8 } from './video_scenes/Scene8';

export const SCENE_DURATIONS = {
  Scene1: 6500,
  Scene2: 7500,
  Scene3: 8000,
  Scene4: 9000,
  Scene5: 8000,
  Scene6: 8000,
  Scene7: 8000,
  Scene8: 7000,
};

export const VIDEO_ASPECT_RATIO: VideoAspectRatio = '9:16';

const SCENE_START_SEC: Record<string, number> = (() => {
  const offsets: Record<string, number> = {};
  let elapsed = 0;
  for (const [key, duration] of Object.entries(SCENE_DURATIONS)) {
    offsets[key] = elapsed / 1000;
    elapsed += duration;
  }
  return offsets;
})();

const SCENES: Record<string, ComponentType> = {
  Scene1,
  Scene2,
  Scene3,
  Scene4,
  Scene5,
  Scene6,
  Scene7,
  Scene8,
};

export default function VideoTemplate({
  durations = SCENE_DURATIONS,
  loop = true,
  paused = false,
  muted = false,
  onSceneChange,
}: {
  durations?: Record<string, number>;
  loop?: boolean;
  paused?: boolean;
  muted?: boolean;
  onSceneChange?: (sceneKey: string) => void;
} = {}) {
  const { currentSceneKey } = useVideoPlayer({ durations, loop, paused });
  const baseSceneKey = currentSceneKey.replace(/_r[12]$/, '');
  const Scene = SCENES[baseSceneKey];
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastSceneRef = useRef<string | null>(null);

  useEffect(() => {
    onSceneChange?.(currentSceneKey);
  }, [currentSceneKey, onSceneChange]);

  useEffect(() => {
    const audio = audioRef.current as unknown as {
      volume: number;
      pause: () => void;
      currentTime: number;
      play: () => Promise<void>;
    } | null;
    if (!audio) return;
    audio.volume = 0.43;
    if (paused) {
      audio.pause();
      return;
    }
    if (lastSceneRef.current !== currentSceneKey) {
      lastSceneRef.current = currentSceneKey;
      const target = (SCENE_START_SEC[baseSceneKey] ?? 0) % 27.036735;
      if (Math.abs(audio.currentTime - target) > 0.18) audio.currentTime = target;
    }
    void audio.play().catch(() => {});
  }, [baseSceneKey, currentSceneKey, muted, paused]);

  return (
    <VideoPausedContext.Provider value={paused}>
      <VideoCanvas aspectRatio={VIDEO_ASPECT_RATIO} style={{ backgroundColor: 'var(--color-bg-dark)' }}>
        <AnimatePresence mode="sync" initial={false}>
          {Scene && (
            <motion.div
              key={currentSceneKey}
              initial={{ opacity: 0, scale: 1.025 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.975, filter: 'blur(4px)' }}
              transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
              style={{ position: 'absolute', inset: 0, overflow: 'hidden', transformOrigin: 'center' }}
            >
              <Scene />
            </motion.div>
          )}
        </AnimatePresence>
        <audio
          ref={audioRef}
          src={`${import.meta.env.BASE_URL}audio/bg_music.mp3`}
          preload="auto"
          autoPlay
          loop
          muted={muted}
        />
      </VideoCanvas>
    </VideoPausedContext.Provider>
  );
}
