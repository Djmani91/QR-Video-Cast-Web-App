import { Maximize2, Monitor, ShieldCheck, Smartphone, Wifi } from "lucide-react";
import "./_group.css";
import "./CurrentPaired.css";

function QrPlaceholder() {
  return (
    <svg className="fc-current-qr" viewBox="0 0 164 164" role="img" aria-label="Pairing QR code preview">
      <rect width="164" height="164" fill="#fff" />
      <path fill="#15211d" d="M6 6h48v48H6zM14 14v32h32V14zM20 20h20v20H20zM110 6h48v48h-48zM118 14v32h32V14zM124 20h20v20h-20zM6 110h48v48H6zM14 118v32h32v-32zM20 124h20v20H20z" />
      <path fill="#15211d" d="M64 8h8v8h-8zM80 8h8v8h-8zM64 24h8v8h-8zM88 24h8v8h-8zM72 32h8v8h-8zM60 48h8v8h-8zM80 48h8v8h-8zM96 48h8v8h-8zM64 64h8v8h-8zM80 64h16v8H80zM104 64h8v8h-8zM120 64h8v8h-8zM144 64h8v8h-8zM56 80h8v8h-8zM72 80h8v8h-8zM96 80h8v8h-8zM112 80h8v8h-8zM136 80h16v8h-16zM64 96h8v8h-8zM80 96h8v8h-8zM96 96h16v8H96zM120 96h8v8h-8zM144 96h8v8h-8zM64 112h8v8h-8zM80 112h8v8h-8zM96 120h8v8h-8zM112 112h8v8h-8zM128 120h8v8h-8zM144 112h8v8h-8zM64 136h8v8h-8zM80 128h8v8h-8zM96 144h8v8h-8zM112 136h16v8h-16zM136 144h16v8h-16z" />
    </svg>
  );
}

export function CurrentPaired() {
  return (
    <div className="fc-current-shell">
      <header className="fc-current-topbar">
        <div className="fc-current-brand">
          <span className="fc-current-brand-mark"><Monitor size={18} /></span>
          <span>framecast</span>
        </div>
        <span className="fc-current-note"><Wifi size={14} /> Works in your browser</span>
      </header>
      <main className="fc-current-page">
        <div className="fc-current-grid">
          <section className="fc-current-copy">
            <span className="fc-current-eyebrow">A better way to share the big screen</span>
            <h1>Your photos &amp; videos.<br /><em>The big screen.</em></h1>
            <p>Send a photo or video from your phone, or open a video link on this TV browser. No account or media upload needed.</p>
            <div className="fc-current-trust"><ShieldCheck size={17} /> Phone files go directly to this screen. Video links are fetched by the TV from their source.</div>
          </section>
          <section className="fc-current-card" aria-label="TV pairing and playback">
            <div className="fc-current-card-heading">
              <div><span className="fc-current-eyebrow">This screen</span><h2>Pair a phone</h2></div>
              <div className="fc-current-actions">
                <span className="fc-current-chip"><Monitor size={13} /> TV browser</span>
                <button className="fc-current-fullscreen" type="button"><Maximize2 size={14} /> Full screen</button>
              </div>
            </div>
            <div className="fc-current-qr-frame"><QrPlaceholder /></div>
            <p className="fc-current-prompt">Your guest is connected and choosing content on their phone.</p>
            <div className="fc-current-room-meta"><span>CODE <strong>58241</strong></span><span>4-hour idle timeout</span></div>
            <div className="fc-current-status"><span className="fc-current-status-dot" /> Paired with a phone. Waiting for a direct connection.</div>
          </section>
        </div>
        <div className="fc-current-footer">Phone files travel directly to the TV. FrameCast does not store or relay media.</div>
      </main>
    </div>
  );
}
