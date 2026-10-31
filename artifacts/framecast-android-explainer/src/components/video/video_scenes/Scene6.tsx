import { motion } from 'framer-motion';
import frameCastIcon from '@assets/framecast-app-icon.png';

export function Scene6() {
  return (
    <section className="fc-scene" style={{ background: '#f7f0dc', color: '#073d2d', textAlign: 'center' }}>
      <motion.div style={{ position: 'absolute', left: '50%', top: '11%', width: '49vw', aspectRatio: '1', transform: 'translateX(-50%)', borderRadius: '16%', overflow: 'hidden', boxShadow: '0 2.5vmin 5vmin rgba(7,61,45,.2)' }} initial={{ scale: .74, opacity: 0, rotate: -5 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} transition={{ duration: .72, ease: [.18,.86,.24,1] }}>
        <img src={frameCastIcon} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        <motion.div style={{ position: 'absolute', inset: '-8%', border: '.8vmin solid #f68b36', borderRadius: '50%' }} initial={{ rotate: -60, scale: 1.35, opacity: 0 }} animate={{ rotate: 0, scale: 1, opacity: .8 }} transition={{ delay: .45, duration: 1.1 }} />
      </motion.div>
      <motion.div style={{ position: 'absolute', top: '48%', left: '5%', right: '5%' }} initial={{ y: 35, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: .55, duration: .55 }}>
        <div style={{ font: '700 11.5vmin/.9 var(--font-display)', letterSpacing: '-.08em' }}>FRAMECAST</div>
        <div className="fc-sub" style={{ marginTop: '2.8vh' }}>Your media stays off<br />FrameCast servers.</div>
      </motion.div>
      <motion.div className="fc-micro" style={{ position: 'absolute', top: '67%', left: '8%', right: '8%', color: '#7352a3' }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.4, duration: .5 }}>DIRECT CONNECTION REQUIRES A COMPATIBLE NETWORK PATH.</motion.div>
      <motion.div style={{ position: 'absolute', left: '50%', top: '76%', transform: 'translateX(-50%)', padding: '1.8vmin 5vw', borderRadius: '99px', background: '#f3c74d', font: '700 5vmin/1 var(--font-display)', letterSpacing: '-.03em' }} initial={{ scale: .72, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 2.1, type: 'spring', stiffness: 240, damping: 20 }}>2tx1.com</motion.div>
      <motion.div style={{ position: 'absolute', bottom: '-75vw', left: '50%', marginLeft: '-75vw', width: '150vw', height: '150vw', borderRadius: '50%', background: '#073d2d' }} initial={{ y: '120%' }} animate={{ y: '0%' }} transition={{ delay: 4.05, duration: .4, ease: 'easeIn' }} />
      <div className="fc-grain" />
    </section>
  );
}
