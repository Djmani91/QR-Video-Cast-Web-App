import { motion } from 'framer-motion';
import frameCastIcon from '@assets/framecast-app-icon.png';
import { PhoneMock } from './AppScreens';

export function Scene8() {
  return (
    <section className="fc-scene" style={{ background: '#f7f0dc', color: '#073d2d', padding: '5vh 6vw' }}>
      <div className="fc-eyebrow" style={{ color: '#7352a3' }}>07 / FINISH YOUR SESSION</div>
      <h2 className="fc-head" style={{ marginTop: '1.4vh', fontSize: '9vmin' }}>DONE?<br /><span style={{ color: '#e74f45' }}>DISCONNECT.</span></h2>
      <motion.div style={{ position: 'absolute', left: '6%', top: '23%' }} initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: .25, duration: .5 }}>
        <PhoneMock screen="disconnect" style={{ width: '48vw' }} />
      </motion.div>
      <motion.div style={{ position: 'absolute', top: '42%', right: '8%', width: '27vw', aspectRatio: '1', borderRadius: '18%', overflow: 'hidden', boxShadow: '0 2vmin 4vmin rgba(7,61,45,.18)' }} initial={{ scale: .78, rotate: -5, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} transition={{ delay: 1.15, duration: .65, ease: [.18,.86,.24,1] }}>
        <img src={frameCastIcon} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </motion.div>
      <motion.div style={{ position: 'absolute', right: '6%', top: '67%', width: '32vw', textAlign: 'center' }} initial={{ y: 15, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 1.7, duration: .45 }}>
        <div style={{ font: '700 6.3vmin/1 var(--font-display)', letterSpacing: '-.06em' }}>framecast</div>
        <div className="app-address" style={{ marginTop: '2vmin' }}>2tx1.com</div>
      </motion.div>
      <motion.div style={{ position: 'absolute', left: '7%', right: '7%', bottom: '5%', textAlign: 'center', color: '#5d6254', font: '500 2.25vmin/1.3 var(--font-body)' }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2.2, duration: .4 }}>
        Tap “Disconnect from this TV” in FrameCast to end the session.
      </motion.div>
      <motion.div style={{ position: 'absolute', width: '150vw', height: '150vw', bottom: '-145vw', left: '50%', marginLeft: '-75vw', borderRadius: '50%', background: '#073d2d' }} initial={{ y: '100%' }} animate={{ y: '0%' }} transition={{ delay: 6.3, duration: .55, ease: 'easeIn' }} />
      <div className="fc-grain" />
    </section>
  );
}
