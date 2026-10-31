import { Check, Maximize2, Minimize2, MonitorPlay } from "lucide-react";
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
};

function CinemaArtwork() {
  return (
    <svg className="fc-cinema-art" viewBox="0 0 1280 720" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="fc-screen" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset=".52" stopColor="#ffdf4f" />
          <stop offset="1" stopColor="#ffffff" />
        </linearGradient>
        <linearGradient id="fc-curtain" x1="0" y1="0" x2="1" y2="0">
          <stop stopColor="#54248f" />
          <stop offset=".5" stopColor="#54248f" />
          <stop offset="1" stopColor="#54248f" />
        </linearGradient>
        <linearGradient id="fc-beam" x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#ffdf4f" stopOpacity=".3" />
          <stop offset="1" stopColor="#ffdf4f" stopOpacity="0" />
        </linearGradient>
        <filter id="fc-soft"><feGaussianBlur stdDeviation="18" /></filter>
      </defs>
      <rect width="1280" height="720" fill="#54248f" />
      <path d="M640 58 172 494h936z" fill="url(#fc-beam)" />
      <ellipse cx="640" cy="440" rx="410" ry="195" fill="#ffdf4f" opacity=".18" filter="url(#fc-soft)" />
      <rect x="264" y="100" width="752" height="420" rx="5" fill="#54248f" stroke="#ffdf4f" strokeWidth="3" />
      <rect x="279" y="115" width="722" height="390" fill="url(#fc-screen)" />
      <circle cx="842" cy="209" r="48" fill="#ffdf4f" opacity=".92" />
      <path d="M279 340c128-16 176-103 279-81 96 21 137 102 245 78 79-18 126-84 198-67v235H279z" fill="#54248f" opacity=".72" />
      <path d="M279 389c112-51 187-25 268 5 95 35 170 16 253-30 83-45 143-40 201 7v134H279z" fill="#54248f" />
      <path d="M279 438c84-37 170-19 245 18 78 39 168 35 246-5 79-40 151-41 231-3v57H279z" fill="#54248f" opacity=".78" />
      <path d="M362 325h19v115h-19zm69-32h16v150h-16zm514 23h19v113h-19z" fill="#54248f" opacity=".9" />
      <path d="M0 0h220c-26 111-4 208 20 287-31 105-32 216-4 433H0z" fill="url(#fc-curtain)" />
      <path d="M0 0h72c-18 132 9 237 21 328-24 112-25 244-10 392H0z" fill="#54248f" opacity=".68" />
      <path d="M1280 0h-220c26 111 4 208 20 287-31 105-32 216 4 433h236z" fill="url(#fc-curtain)" />
      <path d="M1280 0h-72c18 132-9 237-21 328 24 112 25 244 10 392h83z" fill="#54248f" opacity=".62" />
      <path d="M0 0c90 43 136 85 220 0M1280 0c-90 43-136 85-220 0" fill="none" stroke="#ffdf4f" strokeOpacity=".65" strokeWidth="13" />
      <path d="M95 0c-8 167 32 261 10 364M1185 0c8 167-32 261-10 364" fill="none" stroke="#ffdf4f" strokeOpacity=".4" strokeWidth="8" />
      <path d="M0 595c214-48 374-29 520 5 81 19 159 19 240 0 146-34 306-53 520-5v125H0z" fill="#54248f" opacity=".82" />
      <path d="M0 639c216-44 354-27 506 6 87 19 181 19 268 0 152-33 290-50 506-6v81H0z" fill="#54248f" opacity=".92" />
      <path d="M0 688c229-42 367-27 510 4 85 19 175 19 260 0 143-31 281-46 510-4v32H0z" fill="#54248f" />
      <g fill="#54248f">
        <path d="M162 569c0-31 26-56 58-56h78c32 0 58 25 58 56v37H162zm15 34h164v17H177z" />
        <path d="M411 579c0-32 26-58 58-58h78c32 0 58 26 58 58v34H411zm15 29h164v17H426z" />
        <path d="M706 579c0-32 26-58 58-58h78c32 0 58 26 58 58v34H706zm15 29h164v17H721z" />
        <path d="M954 569c0-31 26-56 58-56h78c32 0 58 25 58 56v37H954zm15 34h164v17H969z" />
      </g>
      <g fill="#ffdf4f">
        <circle cx="160" cy="72" r="2" /><circle cx="1120" cy="90" r="2" />
        <circle cx="185" cy="115" r="1.5" /><circle cx="1090" cy="141" r="1.5" />
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
      <path d="M76 44c6 5 8 10 7 16m36-25c6 5 8 10 7 16" fill="none" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" opacity=".8" />
    </svg>
  );
}

export function TvCinemaWaitingScreen({
  connectionLabel,
  connectionMessage,
  readyMessage,
  errorMessage,
  isFullscreen,
  needsManualFullscreen,
  onToggleFullscreen,
  onNewRoom,
}: TvCinemaWaitingScreenProps) {
  return (
    <main className="fc-cinema-shell" aria-label="FrameCast connected standby screen">
      <CinemaArtwork />
      <div className="fc-cinema-vignette" />
      <header className="fc-cinema-topbar">
        <div className="fc-cinema-brand"><span className="fc-cinema-brand-mark"><MonitorPlay size={19} /></span><span>framecast</span></div>
        <div className="fc-cinema-topbar-actions">
          <span className="fc-cinema-private"><span className="fc-cinema-private-dot" /> PRIVATE LOCAL CONNECTION</span>
          <button className="fc-cinema-new-room" type="button" onClick={onNewRoom}>New room</button>
        </div>
      </header>
      <section className="fc-cinema-message" aria-labelledby="fc-cinema-title">
        <div className="fc-cinema-kicker"><span className="fc-cinema-kicker-line" /> THE SHOW IS YOURS</div>
        <h1 id="fc-cinema-title">Movie night<br /><em>starts here.</em></h1>
        <div className="fc-cinema-ready" role="status" aria-live="polite">
          <span className="fc-cinema-check"><Check size={15} strokeWidth={2.8} /></span>
          <span><strong>{connectionLabel}</strong><small>{readyMessage}</small></span>
        </div>
        <p className="fc-cinema-connection">{connectionMessage}</p>
        <button className="fc-cinema-fullscreen" type="button" onClick={onToggleFullscreen} aria-label={isFullscreen ? "Exit browser full screen" : "Enter browser full screen"}>
          {isFullscreen ? <Minimize2 size={19} /> : <Maximize2 size={19} />}
          <span>{isFullscreen ? "Exit full screen" : "Full screen"}</span>
          <kbd>OK</kbd>
        </button>
        {needsManualFullscreen && <p className="fc-cinema-fallback" role="status">Select Full screen with the TV remote if the browser controls remain visible.</p>}
        {errorMessage && <p className="fc-cinema-error" role="alert">{errorMessage}</p>}
      </section>
      <div className="fc-cinema-popcorn"><PopcornIllustration /></div>
      <div className="fc-cinema-bottomline"><span>YOUR PHOTOS &amp; VIDEOS, ON THE BIG SCREEN</span><span className="fc-cinema-reel"><i /><i /><i /><i /><i /><i /></span></div>
    </main>
  );
}
