import { LockKeyhole, Monitor, ShieldCheck, Smartphone, Wifi } from 'lucide-react';
import './_group.css';
import './Current.css';

// Visual extraction of the real FrameCast TV home screen from artifacts/framecast/src/App.tsx.
// Live pairing is intentionally static in the design sandbox; the production page retains it.
export function Current() {
  return (
    <div className="fc-current">
      <header className="fc-topbar">
        <a href="#" className="fc-brand" aria-label="FrameCast home">
          <span className="fc-mark"><Monitor size={19} strokeWidth={2.2} /></span>
          <span className="fc-brand-name">framecast</span>
        </a>
        <span className="fc-topnote">
          <Wifi size={14} /> Works in your browser
          <span className="fc-domain">2tx1.com</span>
        </span>
      </header>

      <main className="fc-page">
        <div className="fc-hero-grid">
          <section className="fc-hero-copy">
            <span className="fc-eyebrow">A better way to share the big screen</span>
            <h1 className="fc-title">Your photos &amp; videos.<br /><em>The big screen.</em></h1>
            <p className="fc-intro">Send a photo or video from your phone, or open a video link on this TV browser. No account or media upload needed.</p>
            <div className="fc-trust"><ShieldCheck size={17} /> Phone files go directly to this screen. Video links are fetched by the TV from their source.</div>
          </section>

          <section className="fc-pair-card" aria-label="TV pairing and playback">
            <div className="fc-card-heading">
              <div><span className="fc-eyebrow">This screen</span><h2>Pair a phone</h2></div>
              <span className="fc-screen-chip"><Monitor size={13} /> TV browser</span>
            </div>
            <div className="fc-qr-frame" aria-label="Pairing code placeholder">
              <div className="fc-qr-empty"><Smartphone size={28} /><span>Your pairing code will appear here</span></div>
            </div>
            <p className="fc-pair-prompt">Preparing a temporary room for this screen…</p>
            <button className="fc-primary-button" type="button" disabled>Preparing your screen…</button>
            <div className="fc-status-row" role="status">
              <span className="fc-status-dot" />
              <span className="fc-status">Creating a private room for your phone.</span>
            </div>
          </section>
        </div>

        <div className="fc-below-grid">
          <section>
            <span className="fc-eyebrow">Three small steps</span>
            <h3>From your phone to here.</h3>
            <div className="fc-steps">
              <div className="fc-step"><span className="fc-step-number">01</span><strong>Make a room</strong></div>
              <div className="fc-step"><span className="fc-step-number">02</span><strong>Scan with your phone</strong></div>
              <div className="fc-step"><span className="fc-step-number">03</span><strong>Show it on the TV</strong></div>
            </div>
          </section>
          <aside className="fc-privacy">
            <LockKeyhole size={18} />
            <div><strong>Private media transfer.</strong><p>Phone files travel directly to the TV. For a video link, the TV requests media from its original site. FrameCast does not store or relay media. The room expires after 4 hours without activity.</p></div>
          </aside>
        </div>
      </main>
    </div>
  );
}
