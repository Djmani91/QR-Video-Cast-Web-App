import { motion } from 'framer-motion';
import { PhoneMock } from './AppScreens';

export function Scene7() {
  return (
    <section className="fc-scene" style={{ background: '#183e67', color: '#fff6e1', padding: '5vh 6vw' }}>
      <div className="fc-eyebrow" style={{ color: '#f3c74d' }}>06 / PREMIUM BACKGROUND CASTING</div>
      <h2 className="fc-head" style={{ marginTop: '1.4vh', fontSize: '8.4vmin' }}>SWITCH APPS.<br /><span style={{ color: '#f3c74d' }}>KEEP CASTING.</span></h2>
      <motion.div style={{ position: 'absolute', left: '21%', top: '23%' }} initial={{ scale: .96, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} transition={{ delay: .3, duration: .55 }}>
        <PhoneMock screen="background" style={{ width: '55vw' }} />
      </motion.div>
      <motion.div style={{ position: 'absolute', left: '6%', top: '52%', padding: '1.3vmin 2.5vmin', borderRadius: '99px', background: '#f3c74d', color: '#073d2d', font: '700 2vmin/1 var(--font-mono)' }} initial={{ x: -22, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 1, duration: .4 }}>TV CONNECTION REMAINS ACTIVE</motion.div>
      <motion.div style={{ position: 'absolute', right: '5%', top: '62%', width: '28vw', font: '500 2.45vmin/1.35 var(--font-body)', color: '#fff6e1' }} initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 1.5, duration: .45 }}>
        Premium starts background casting automatically when you connect. Android shows a casting notification; the TV keeps playing while FrameCast is backgrounded.
      </motion.div>
      <div className="scene-caption" style={{ bottom: '3.5%' }}>
        <div className="scene-caption-main">This background-casting flow is Premium.</div>
        <div className="scene-caption-detail" style={{ color: '#f3c74d' }}>FREE CASTING STOPS WHEN FRAMECAST IS BACKGROUNDED</div>
      </div>
      <div className="fc-grain" />
    </section>
  );
}
