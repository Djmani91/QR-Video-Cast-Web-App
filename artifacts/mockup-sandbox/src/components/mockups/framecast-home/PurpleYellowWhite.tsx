import { ArrowRight, LockKeyhole, Monitor, ShieldCheck, Smartphone, Wifi } from 'lucide-react';
import './PurpleYellowWhite.css';

export function PurpleYellowWhite() {
  return (
    <div className="fc-pyw">
      <header className="pyw-header">
        <a href="#" className="pyw-brand" aria-label="FrameCast home">
          <span className="pyw-mark"><Monitor size={21} strokeWidth={2.2} /></span>
          <span className="pyw-brand-name">framecast</span>
        </a>
        <div className="pyw-header-right">
          <span className="pyw-browser"><Wifi size={15} /> Works in your browser</span>
          <span className="pyw-domain">2tx1.com</span>
        </div>
      </header>

      <main className="pyw-main">
        <div className="pyw-hero">
          <section className="pyw-copy">
            <div className="pyw-kicker"><span className="pyw-kicker-mark" aria-hidden="true" /> A better way to share the big screen</div>
            <h1>Your photos<br />&amp; videos.<br /><em>The big screen.</em></h1>
            <p className="pyw-intro">Send a photo or video from your phone, or open a video link on this TV browser. No account or media upload needed.</p>
            <div className="pyw-trust"><ShieldCheck size={19} /><span>Phone files go directly to this screen. Video links are fetched by the TV from their source.</span></div>
            <div className="pyw-orbit" aria-hidden="true">
              <span className="pyw-orbit-ring" />
              <span className="pyw-orbit-sun" />
              <span className="pyw-orbit-label">BIG SCREEN<br />ENERGY</span>
            </div>
          </section>

          <section className="pyw-pair-card" aria-label="TV pairing and playback">
            <div className="pyw-card-topline">
              <div>
                <span className="pyw-card-eyebrow">THIS SCREEN</span>
                <h2>Pair a phone</h2>
              </div>
              <span className="pyw-screen-chip"><Monitor size={14} /> TV browser</span>
            </div>
            <div className="pyw-code-shell" aria-label="Pairing code placeholder">
              <div className="pyw-code-inner">
                <span className="pyw-placeholder-tag">PAIRING CODE</span>
                <Smartphone size={33} strokeWidth={1.7} />
                <span>Your pairing code<br />will appear here</span>
                <span className="pyw-placeholder-note">Preview only · not scannable</span>
              </div>
            </div>
            <p className="pyw-pair-prompt">Preparing a temporary room for this screen…</p>
            <button className="pyw-primary-button" type="button" disabled>
              Preparing your screen… <ArrowRight size={17} />
            </button>
            <div className="pyw-status" role="status">
              <span className="pyw-status-dot" />
              <span>Creating a private room for your phone.</span>
            </div>
          </section>
        </div>

        <div className="pyw-details">
          <section className="pyw-steps-section">
            <span className="pyw-section-label">THREE SMALL STEPS</span>
            <h3>From your phone to here.</h3>
            <div className="pyw-steps">
              <div className="pyw-step"><span>01</span><strong>Make a room</strong></div>
              <div className="pyw-step"><span>02</span><strong>Scan with your phone</strong></div>
              <div className="pyw-step"><span>03</span><strong>Show it on the TV</strong></div>
            </div>
          </section>
          <aside className="pyw-privacy">
            <span className="pyw-lock"><LockKeyhole size={19} /></span>
            <div>
              <strong>Private media transfer.</strong>
              <p>Phone files travel directly to the TV. For a video link, the TV requests media from its original site. FrameCast does not store or relay media. The room expires after 4 hours without activity.</p>
            </div>
          </aside>
        </div>
        <footer className="pyw-footer"><span>2tx1.com</span><span>FRAMECAST</span></footer>
      </main>
    </div>
  );
}
