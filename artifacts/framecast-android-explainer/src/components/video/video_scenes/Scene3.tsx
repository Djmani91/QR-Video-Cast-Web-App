import { motion } from 'framer-motion';
import { PhoneMock } from './AppScreens';

export function Scene3() {
  return (
    <section className="fc-scene" style={{ background: '#35274b', color: '#fff6e1', padding: '5vh 6vw' }}>
      <div className="fc-eyebrow" style={{ color: '#f3c74d' }}>02 / IMAGES</div>
      <h2 className="fc-head" style={{ marginTop: '1.6vh', fontSize: '8.6vmin' }}>PICK PHOTOS.<br /><span style={{ color: '#f68b36' }}>ONLY WHAT YOU WANT.</span></h2>
      <motion.div
        style={{ position: 'absolute', left: '5%', top: '20%', zIndex: 2 }}
        initial={{ opacity: 0 }}
        animate={{ opacity: [1, 1, 0, 0] }}
        transition={{ duration: 8, times: [0, .28, .38, 1], ease: 'linear' }}
      >
        <PhoneMock screen="photoPicker" style={{ width: '60vw' }} />
      </motion.div>
      <motion.div
        style={{ position: 'absolute', left: '5%', top: '20%', zIndex: 2 }}
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0, 1, 1] }}
        transition={{ duration: 8, times: [0, .28, .38, 1], ease: 'linear' }}
      >
        <PhoneMock screen="photos" style={{ width: '60vw' }} />
      </motion.div>
      <motion.div className="app-card" style={{ position: 'absolute', right: '6%', bottom: '15%', width: '30vw', zIndex: 4, margin: 0, padding: '2vmin', color: '#202a37' }} initial={{ y: 18, opacity: 0, scale: .96 }} animate={{ y: 0, opacity: 1, scale: 1 }} transition={{ delay: 3.5, duration: .45 }}>
        <div className="app-card-label">PHONE PHOTO CONTROLS</div>
        <div className="app-control-row" style={{ gap: '.8vmin', marginTop: '1.2vmin' }}>
          <div className="app-control" style={{ minWidth: '8vmin', minHeight: '6vmin' }}>‹ Back</div>
          <div className="app-control primary" style={{ minWidth: '7vmin', minHeight: '6vmin' }}>1 / 3</div>
          <div className="app-control" style={{ minWidth: '8vmin', minHeight: '6vmin' }}>Next ›</div>
        </div>
        <div className="app-control-row" style={{ gap: '.8vmin', marginTop: '1vmin' }}>
          <div className="app-control">−</div><div className="app-control">Fit</div><div className="app-control">+</div>
        </div>
        <div className="app-control-row" style={{ gap: '.8vmin', marginTop: '1vmin' }}>
          <div className="app-control" style={{ padding: '1vmin 1.3vmin' }}>↑ Move up</div>
          <div className="app-control" style={{ padding: '1vmin 1.3vmin' }}>↓ Move down</div>
        </div>
        <div className="app-note">Browse photos · zoom in / out</div>
      </motion.div>
      <div className="scene-caption" style={{ bottom: '3%' }}>
        <div className="scene-caption-main">Free: 1 photo per TV session · rewarded ad: 1 more</div>
        <div className="scene-caption-detail" style={{ color: '#f3c74d' }}>PREMIUM: UP TO 20 PHOTOS PER SESSION</div>
      </div>
      <div className="fc-grain" />
    </section>
  );
}
