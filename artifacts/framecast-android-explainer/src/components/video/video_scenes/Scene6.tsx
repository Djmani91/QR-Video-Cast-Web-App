import { motion } from 'framer-motion';
import { PhoneMock } from './AppScreens';

export function Scene6() {
  return (
    <section className="fc-scene" style={{ background: '#35274b', color: '#fff6e1', padding: '5vh 6vw' }}>
      <div className="fc-eyebrow" style={{ color: '#f3c74d' }}>05 / ALLOW SCREEN CAPTURE</div>
      <h2 className="fc-head" style={{ marginTop: '1.4vh', fontSize: '8.5vmin' }}>APPROVE ANDROID.<br /><span style={{ color: '#f68b36' }}>THEN MIRROR.</span></h2>
      <motion.div style={{ position: 'absolute', left: '2%', top: '25%' }} initial={{ x: -18, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: .25, duration: .5 }}>
        <PhoneMock screen="permission" style={{ width: '46vw' }} />
      </motion.div>
      <motion.div style={{ position: 'absolute', right: '2%', top: '25%' }} initial={{ x: 18, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 1.1, duration: .5 }}>
        <PhoneMock screen="mirrorActive" style={{ width: '46vw' }} />
      </motion.div>
      <motion.div style={{ position: 'absolute', left: '42%', top: '54%', zIndex: 5, color: '#f3c74d', font: '700 7vmin/1 var(--font-display)' }} initial={{ scale: .4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 1.65, type: 'spring', stiffness: 260 }}>→</motion.div>
      <motion.div style={{ position: 'absolute', bottom: '6%', left: '7%', right: '7%', textAlign: 'center' }} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 2.2, duration: .4 }}>
        <div className="scene-caption-main">Visible phone content—including notifications—may appear on the TV.</div>
        <div className="scene-caption-detail" style={{ color: '#f3c74d' }}>SUPPORTED APP AUDIO MAY BE SENT · PROTECTED APPS MAY BLOCK VIDEO / AUDIO · NO MICROPHONE RECORDING</div>
      </motion.div>
      <div className="fc-grain" />
    </section>
  );
}
