import { motion } from 'framer-motion';
import { Eyebrow, PhoneSet, TvSet } from '../FrameParts';

export function Scene1() {
  return (
    <section className="fc-scene" style={{ background: '#073d2d', color: '#fff6e1' }}>
      <motion.div initial={{ opacity: 0, y: -30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .45 }}>
        <Eyebrow color="#f3c74d">FRAMECAST FOR ANDROID · 01</Eyebrow>
        <h1 className="fc-head" style={{ marginTop: '4vh', fontSize: '10.7vmin' }}>YOUR<br />MEDIA.<br /><span style={{ color: '#f68b36' }}>BIG SCREEN.</span></h1>
      </motion.div>
      <motion.div className="fc-device-shadow" style={{ position: 'absolute', top: '44%', left: '13%', width: '76%' }} initial={{ scale: .77, rotate: -4, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} transition={{ delay: .38, duration: .65, ease: [.18, .86, .24, 1] }}>
        <div className="fc-tv">
          <div className="fc-tv-glass">
            <div className="fc-still"><motion.div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(120deg,transparent 30%,rgba(255,246,225,.34) 48%,transparent 67%)' }} animate={{ x: ['-80%', '100%'] }} transition={{ duration: 2.5, delay: 1.3, repeat: Infinity, repeatDelay: .6 }} /></div>
            <motion.div className="fc-play" initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 1.4, type: 'spring', stiffness: 280, damping: 18 }} />
          </div>
          <div className="fc-tv-stand" />
        </div>
      </motion.div>
      <motion.div style={{ position: 'absolute', bottom: '8%', left: '9%', display: 'flex', alignItems: 'center', gap: '5vw' }} initial={{ x: -60, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: .8, duration: .55 }}>
        <PhoneSet style={{ transform: 'rotate(-8deg) scale(.84)', transformOrigin: 'bottom left' }} />
        <div style={{ width: '42vw' }}>
          <div style={{ height: '.8vmin', width: '100%', background: '#f68b36', transform: 'rotate(-13deg)', transformOrigin: 'left' }} />
          <motion.div className="fc-media-card" style={{ left: '27vw', bottom: '20vw', zIndex: 3, width: '34vw', height: '22vw' }} initial={{ x: -70, y: 90, scale: .4, rotate: -15, opacity: 0 }} animate={{ x: 110, y: -230, scale: 1, rotate: 3, opacity: 1 }} transition={{ delay: .83, duration: 1.15, ease: [.18, .86, .24, 1] }}>
            <div className="fc-still" style={{ inset: '1vmin', borderRadius: '2vmin' }} />
          </motion.div>
        </div>
      </motion.div>
      <motion.p className="fc-sub" style={{ position: 'absolute', bottom: '5.6%', right: '7%', color: '#f7f0dc', textAlign: 'right', margin: 0 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2.8 }}>Your media, bigger.</motion.p>
      <div className="fc-grain" />
    </section>
  );
}
