import { motion } from 'framer-motion';
import { Eyebrow, PhoneSet } from '../FrameParts';

export function Scene2() {
  return (
    <section className="fc-scene" style={{ background: '#f7f0dc', color: '#073d2d' }}>
      <motion.div initial={{ opacity: 0, scale: .92 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: .55 }}>
        <Eyebrow>01 / PAIR</Eyebrow>
        <h2 className="fc-head" style={{ marginTop: '2.8vh', fontSize: '9.4vmin' }}>OPEN THE<br />TV BROWSER.</h2>
      </motion.div>
      <motion.div style={{ position: 'absolute', top: '29%', left: '7%', width: '86%', padding: '2.5vmin', borderRadius: '5vmin', background: '#073d2d', boxShadow: '0 3vmin 6vmin rgba(7,61,45,.23)' }} initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: .28, duration: .55 }}>
        <div style={{ height: '36vw', minHeight: '18vh', borderRadius: '3.5vmin', overflow: 'hidden', background: '#f7f0dc' }}>
          <div style={{ height: '6.8vmin', display: 'flex', alignItems: 'center', gap: '1.3vmin', padding: '0 2.5vmin', background: '#e8dfc7' }}>
            <i style={{ width: '1.4vmin', height: '1.4vmin', borderRadius: '50%', background: '#e74f45' }} /><i style={{ width: '1.4vmin', height: '1.4vmin', borderRadius: '50%', background: '#f3c74d' }} /><i style={{ width: '1.4vmin', height: '1.4vmin', borderRadius: '50%', background: '#72c34c' }} />
            <span className="fc-micro" style={{ marginLeft: '2vw', color: '#657264' }}>TV BROWSER</span>
          </div>
          <div style={{ padding: '5vmin 4vmin' }}>
            <div className="fc-micro" style={{ color: '#7b7c6d' }}>GO TO</div>
            <motion.div style={{ font: '700 7.6vmin/1 var(--font-display)', letterSpacing: '-.06em', marginTop: '1.5vmin' }} initial={{ width: 0, overflow: 'hidden', whiteSpace: 'nowrap' }} animate={{ width: '100%' }} transition={{ delay: .72, duration: .68, ease: 'easeOut' }}>2tx1.com</motion.div>
            <div style={{ height: '.6vmin', background: '#f3c74d', width: '34vw', marginTop: '2.5vmin' }} />
          </div>
        </div>
      </motion.div>
      <motion.div style={{ position: 'absolute', top: '56%', left: '31%', zIndex: 3, width: '38vw', height: '38vw', border: '.65vmin solid #7352a3', borderRadius: '50%', display: 'grid', placeItems: 'center', background: '#f7f0dc' }} initial={{ scale: .3, rotate: -80, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} transition={{ delay: 1.2, duration: .8, type: 'spring', stiffness: 180, damping: 20 }}>
        <div style={{ font: '700 10vmin/1 var(--font-display)', letterSpacing: '.08em', color: '#7352a3' }}>4 8 2 1</div>
        <motion.div style={{ position: 'absolute', inset: '-4vmin', border: '.6vmin dashed #f68b36', borderRadius: '50%' }} animate={{ rotate: 360 }} transition={{ duration: 12, repeat: Infinity, ease: 'linear' }} />
      </motion.div>
      <PhoneSet style={{ position: 'absolute', left: '31%', bottom: '7%', transform: 'scale(.72)' }} />
      <motion.div className="fc-sub" style={{ position: 'absolute', bottom: '6%', left: '8%', width: '82%', textAlign: 'center', color: '#fff6e1', zIndex: 5 }} initial={{ y: 25, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 2.2, duration: .5 }}>
        <span style={{ display: 'inline-block', background: '#073d2d', borderRadius: '99px', padding: '1.5vmin 4vmin' }}>Pair with the on-screen code.</span>
      </motion.div>
      <div className="fc-grain" />
    </section>
  );
}
