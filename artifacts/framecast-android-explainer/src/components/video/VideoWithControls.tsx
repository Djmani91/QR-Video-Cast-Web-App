import { useCallback, useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX, Pause, Play, Repeat, ChevronDown, ChevronUp } from 'lucide-react';
import VideoTemplate, { SCENE_DURATIONS } from './VideoTemplate';
import { useSceneControls } from './useSceneControls';

const SCENE_TITLES = ['Big screen', 'Pair', 'Photos', 'Video playback', 'Premium mirror', 'Screen permission', 'Background casting', 'Disconnect'];

export default function VideoWithControls() {
  const browser = globalThis as unknown as {
    self?: unknown;
    top?: unknown;
    parent?: { postMessage: (message: unknown, targetOrigin: string) => void };
    setInterval: typeof setInterval;
    clearInterval: typeof clearInterval;
  };
  const isIframed = typeof browser.self !== 'undefined' && browser.self !== browser.top;
  const [muted, setMuted] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const elapsedBaseRef = useRef(0);
  const control = useSceneControls(SCENE_DURATIONS);

  useEffect(() => {
    setElapsed(0);
    elapsedBaseRef.current = 0;
  }, [control.activeIndex, control.mountKey, control.tick]);

  useEffect(() => {
    if (control.paused) return;
    const started = performance.now();
    const timer = browser.setInterval(() => setElapsed(elapsedBaseRef.current + performance.now() - started), 60);
    return () => {
      browser.clearInterval(timer);
      elapsedBaseRef.current += performance.now() - started;
    };
  }, [control.activeIndex, control.mountKey, control.paused, control.tick]);

  if (!isIframed) return <VideoTemplate />;
  const totalElapsed = Math.min(control.totalDuration, control.activeStartTime + Math.min(elapsed, control.activeDuration));
  const displayTime = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
  const jumpTo = useCallback((index: number) => {
    control.jumpTo(index);
    browser.parent?.postMessage({
      type: 'REPLIT_VIDEO_SCENE_SELECTED',
      payload: {
        sceneIndex: index,
        sceneCount: control.keys.length,
        sceneTitle: SCENE_TITLES[index],
        filePath: `src/components/video/video_scenes/Scene${index + 1}.tsx`,
        lineNumber: 1,
      },
    }, '*');
  }, [control.jumpTo, control.keys.length]);

  useEffect(() => {
    if (!control.paused) return;
    const documentLike = (globalThis as unknown as {
      document?: { getAnimations?: () => Array<{ playState: string; pause: () => void; play: () => void }> };
    }).document;
    const running = documentLike?.getAnimations?.().filter((animation) => animation.playState === 'running') ?? [];
    running.forEach((animation) => animation.pause());
    return () => running.forEach((animation) => animation.play());
  }, [control.paused]);

  return (
    <div className="fc-preview">
      <VideoTemplate
        key={control.mountKey}
        durations={control.durations}
        loop
        paused={control.paused}
        muted={muted}
        onSceneChange={control.onSceneChange}
      />
      <div className="fc-control-sensor" onMouseEnter={() => setHovering(true)} onMouseLeave={() => setHovering(false)} onPointerDown={() => { if (collapsed) setCollapsed(false); }}>
        <div className={`fc-controls ${collapsed && !hovering ? 'is-collapsed' : ''}`}>
          <div className="fc-control-bar">
            <button aria-label={control.paused ? 'Play' : 'Pause'} onClick={control.togglePause}>{control.paused ? <Play /> : <Pause />}</button>
            <button aria-label={control.locked ? 'Unlock scene loop' : 'Loop current scene'} aria-pressed={control.locked} className={control.locked ? 'is-active' : ''} onClick={control.toggleLock}><Repeat /></button>
            <button aria-label={muted ? 'Unmute soundtrack' : 'Mute soundtrack'} onClick={() => setMuted((value) => !value)}>{muted ? <VolumeX /> : <Volume2 />}</button>
            <div className="fc-control-divider" />
            <div className="fc-segments">
              {control.keys.map((key, index) => (
                <button key={key} aria-label={`Jump to ${SCENE_TITLES[index]}`} aria-current={index === control.activeIndex ? 'true' : undefined} onClick={() => jumpTo(index)}>
                  <span style={{ width: `${index === control.activeIndex ? Math.min(100, elapsed / control.activeDuration * 100) : index < control.activeIndex ? 100 : 0}%` }} />
                </button>
              ))}
            </div>
            <div className="fc-count">{control.activeIndex + 1}/{control.keys.length}</div>
            <div className="fc-clock">{displayTime(totalElapsed)} / {displayTime(control.totalDuration)}</div>
            <button aria-label={collapsed ? 'Show controls' : 'Hide controls'} onClick={() => setCollapsed((value) => !value)}>{collapsed ? <ChevronUp /> : <ChevronDown />}</button>
          </div>
        </div>
      </div>
      <style>{`
        .fc-preview { position:relative; width:100%; height:100vh; overflow:hidden; }
        .fc-control-sensor { position:absolute; z-index:80; inset:auto 0 0; height:25%; display:flex; align-items:flex-end; pointer-events:auto; }
        .fc-controls { width:100%; padding:1.4rem 1.2rem 1.1rem; background:linear-gradient(0deg,rgba(7,34,27,.86),rgba(7,34,27,.54)); color:#fff6e1; transition:transform .22s ease,opacity .22s ease; }
        .fc-controls.is-collapsed { transform:translateY(100%); opacity:0; pointer-events:none; }
        .fc-control-bar { display:flex; align-items:center; gap:.5rem; width:100%; }
        .fc-control-bar button { display:grid; place-items:center; flex:0 0 2.6rem; height:2.6rem; padding:0; border:0; border-radius:.8rem; color:inherit; background:transparent; cursor:pointer; }
        .fc-control-bar button:hover,.fc-control-bar button.is-active { background:rgba(255,246,225,.18); }
        .fc-control-bar button svg { width:1.3rem; height:1.3rem; }
        .fc-control-divider { height:1.8rem; width:1px; background:rgba(255,246,225,.26); margin:0 .3rem; }
        .fc-segments { display:flex; flex:1; gap:.22rem; align-items:center; }
        .fc-segments button { flex:1; height:.65rem; min-width:0; border-radius:99px; background:rgba(255,246,225,.25); overflow:hidden; }
        .fc-segments span { display:block; height:100%; border-radius:99px; background:#f3c74d; }
        .fc-count,.fc-clock { font:500 .76rem/1 var(--font-mono); white-space:nowrap; color:rgba(255,246,225,.8); }
        .fc-clock { min-width:6.5rem; text-align:right; }
        @media(max-width:650px) { .fc-controls { padding:.55rem .45rem .5rem; } .fc-control-bar { gap:.1rem; } .fc-control-bar button { flex-basis:2rem; height:2.2rem; } .fc-control-bar button svg { width:1.05rem;height:1.05rem; } .fc-clock { min-width:4.7rem;font-size:.57rem; } .fc-count {font-size:.62rem;} .fc-control-divider {margin:0 .1rem;} }
      `}</style>
    </div>
  );
}
