import { motion } from 'framer-motion';
import { PhoneMock } from './AppScreens';

export function Scene1() {
  return (
    <section className="fc-scene" style={{ background: '#073d2d', color: '#fff6e1', padding: '6vh 6vw' }}>
      <motion.div initial={{ opacity: 0, y: -22 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .45 }}>
        <div className="fc-eyebrow" style={{ color: '#f3c74d' }}>FRAMECAST FOR ANDROID</div>
        <h1 className="fc-head" style={{ marginTop: '2.4vh', fontSize: '9.5vmin' }}>YOUR MEDIA.<br /><span style={{ color: '#f68b36' }}>YOUR TV.</span></h1>
      </motion.div>
      <motion.div style={{ position: 'absolute', top: '24.5%', left: '23%' }} initial={{ scale: .9, opacity: 0, rotate: -2 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} transition={{ delay: .55, duration: .7, ease: [.18,.86,.24,1] }}>
        <PhoneMock screen="photos" style={{ width: '54vw' }} />
      </motion.div>
      <div className="scene-caption">
        <div className="scene-caption-main">Choose the media. Watch it on the big screen.</div>
        <div className="scene-caption-detail" style={{ color: '#f3c74d' }}>PHOTOS · VIDEOS · SCREEN MIRRORING</div>
      </div>
      <div className="fc-grain" />
    </section>
  );
}
