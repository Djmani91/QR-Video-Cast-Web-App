import { Check, Maximize2, Minimize2, MonitorPlay, Smartphone } from "lucide-react";
import "./TvCinemaWaitingScreen.css";

type TvCinemaWaitingScreenProps = {
  connectionLabel: string;
  connectionMessage: string;
  readyMessage: string;
  errorMessage?: string;
  isFullscreen: boolean;
  needsManualFullscreen: boolean;
  onToggleFullscreen: () => void;
  onNewRoom: () => void;
  loading?: boolean;
};

function CinemaArtwork() {
  return (
    <svg className="fc-cinema-art" viewBox="0 0 1280 720" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="fc-beam" x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#ffdf4f" stopOpacity=".26" />
          <stop offset="1" stopColor="#ffdf4f" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="1280" height="720" fill="#54248f" />
      <path d="M640 40 140 560h1000z" fill="url(#fc-beam)" />
      <path d="M0 0h200c-26 111-4 208 20 287-31 105-32 216-4 433H0z" fill="#4a1f80" />
      <path d="M1280 0h-200c26 111 4 208 20 287-31 105-32 216 4 433h176z" fill="#4a1f80" />
      <path d="M0 0c90 43 136 85 200 0M1280 0c-90 43-136 85-200 0" fill="none" stroke="#ffdf4f" strokeOpacity=".6" strokeWidth="12" />
      <path d="M0 640c216-44 354-27 506 6 87 19 181 19 268 0 152-33 290-50 506-6v80H0z" fill="#3f1a6e" />
      <g fill="#ffdf4f" opacity=".7">
        <circle cx="300" cy="90" r="2" /><circle cx="980" cy="110" r="2" />
        <circle cx="420" cy="150" r="1.5" /><circle cx="860" cy="70" r="1.5" />
      </g>
    </svg>
  );
}

function PopcornIllustration() {
  return (
    <svg className="fc-popcorn-art" viewBox="0 0 190 190" aria-hidden="true">
      <g fill="#ffffff" stroke="#ffdf4f" strokeWidth="2">
        <circle cx="53" cy="48" r="22" /><circle cx="87" cy="35" r="25" />
        <circle cx="121" cy="46" r="23" /><circle cx="143" cy="66" r="20" />
        <circle cx="42" cy="76" r="19" /><circle cx="84" cy="67" r="24" />
        <circle cx="119" cy="73" r="23" />
      </g>
      <path d="m37 82 13 92h92l15-92z" fill="#54248f" stroke="#ffdf4f" strokeWidth="4" />
      <path d="m58 84 11 90m24-91 2 91m36-91-11 91" fill="none" stroke="#ffdf4f" strokeWidth="10" />
      <path d="M34 83h126" stroke="#ffdf4f" strokeWidth="8" strokeLinecap="round" />
    </svg>
  );
}

const CARDS = [
  { kind: "video", top: "14%", dur: "34s", delay: "0s", tilt: "-4deg" },
  { kind: "photo", top: "38%", dur: "41s", delay: "-12s", tilt: "3deg" },
  { kind: "film", top: "62%", dur: "38s", delay: "-25s", tilt: "-2deg" },
  { kind: "photo", top: "24%", dur: "46s", delay: "-31s", tilt: "5deg" },
  { kind: "video", top: "72%", dur: "43s", delay: "-6s", tilt: "2deg" },
];

const KERNELS = [
  { left: "12%", dur: "9s", delay: "0s" },
  { left: "31%", dur: "11s", delay: "-4s" },
  { left: "54%", dur: "10s", delay: "-7s" },
  { left: "71%", dur: "12s", delay: "-2s" },
  { left: "88%", dur: "9.5s", delay: "-5s" },
];

export function TvCinemaWaitingScreen({
  connectionLabel,
  connectionMessage,
  readyMessage,
  errorMessage,
  isFullscreen,
  needsManualFullscreen,
  onToggleFullscreen,
  onNewRoom,
  loading = false,
}: TvCinemaWaitingScreenProps) {
  return (
    <main className={`fc-cinema-shell${loading ? " is-loading" : ""}`} aria-label="FrameCast connected standby screen" aria-busy={loading}>
      <CinemaArtwork />
      <div className="fc-cinema-parade" aria-hidden="true">
        {CARDS.map((c, i) => (
          <div key={i} className={`fc-card fc-card-${c.kind}`} style={{ top: c.top, animationDuration: c.dur, animationDelay: c.delay, ["--tilt" as string]: c.tilt }}>
            <span className="fc-card-face"><i /></span>
          </div>
        ))}
      </div>
      <div className="fc-cinema-kernels" aria-hidden="true">
        {KERNELS.map((k, i) => <span key={i} style={{ left: k.left, animationDuration: k.dur, animationDelay: k.delay }} />)}
      </div>
      <div className="fc-cinema-vignette" aria-hidden="true" />
      <header className="fc-cinema-topbar">
        <div className="fc-cinema-brand"><span className="fc-cinema-brand-mark"><MonitorPlay size={19} /></span><span>framecast</span></div>
        <div className="fc-cinema-topbar-actions">
          <span className="fc-cinema-private"><span className="fc-cinema-private-dot" /> PRIVATE LOCAL CONNECTION</span>
          <button className="fc-cinema-new-room" type="button" onClick={onNewRoom}>New room</button>
        </div>
      </header>
      <section className="fc-cinema-message" aria-labelledby="fc-cinema-title">
        <div className="fc-cinema-phone-pill"><Smartphone size={15} /> <span>{connectionLabel}</span><span className="fc-cinema-pulse" aria-hidden="true" /></div>
        <h1 id="fc-cinema-title">
          {loading ? <>Getting your<br /><em>media ready…</em></> : <>Movie night<br /><em>starts here.</em></>}
        </h1>
        <div className="fc-cinema-ready" role="status" aria-live="polite">
          <span className="fc-cinema-check"><Check size={15} strokeWidth={2.8} /></span>
          <span>
            <strong>{connectionLabel}</strong>
            <small>{loading ? "Keep FrameCast open on your phone." : readyMessage}</small>
          </span>
        </div>
        <p className="fc-cinema-connection">{connectionMessage}</p>
        {loading && <div className="fc-cinema-loadbar" aria-hidden="true"><i /></div>}
        <button className="fc-cinema-fullscreen" type="button" onClick={onToggleFullscreen} aria-label={isFullscreen ? "Exit browser full screen" : "Enter browser full screen"}>
          {isFullscreen ? <Minimize2 size={19} /> : <Maximize2 size={19} />}
          <span>{isFullscreen ? "Exit full screen" : "Full screen"}</span>
          <kbd>OK</kbd>
        </button>
        {needsManualFullscreen && <p className="fc-cinema-fallback" role="status">Select Full screen with the TV remote if the browser controls remain visible.</p>}
        {errorMessage && <p className="fc-cinema-error" role="alert">{errorMessage}</p>}
      </section>
      <div className="fc-cinema-popcorn" aria-hidden="true"><PopcornIllustration /></div>
      <div className="fc-cinema-bottomline"><span>YOUR PHOTOS &amp; VIDEOS, ON THE BIG SCREEN</span><span className="fc-cinema-reel" aria-hidden="true"><i /><i /><i /><i /><i /><i /></span></div>
    </main>
  );
}
