import { motion } from 'framer-motion';
import { PhoneMock } from './AppScreens';

export function Scene5() {
  return (
    <section className="fc-scene" style={{ background: '#f7f0dc', color: '#073d2d', padding: '5vh 6vw' }}>
      <div className="fc-eyebrow" style={{ color: '#7352a3' }}>04 / MIRROR YOUR PHONE</div>
      <h2 className="fc-head" style={{ marginTop: '1.5vh', fontSize: '9vmin' }}>SCREEN MIRRORING.<br /><span style={{ color: '#7352a3' }}>PREMIUM ONLY.</span></h2>
      <motion.div
        style={{ position: 'absolute', left: '17%', top: '24%' }}
        initial={{ opacity: 0, scale: .94, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ delay: .3, duration: .55 }}
      >
        <PhoneMock screen="mirror" style={{ width: '55vw' }} />
      </motion.div>
      <motion.div
        style={{ position: 'absolute', left: '17%', top: '24%' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0, 1, 1] }}
        transition={{ duration: 8, times: [0, .34, .43, 1], ease: 'linear' }}
      >
        <PhoneMock screen="premium" style={{ width: '55vw' }} delay={.1} />
      </motion.div>
      <motion.div style={{ position: 'absolute', left: '7%', top: '44%', padding: '1.4vmin 2.5vmin', borderRadius: '99px', background: '#7352a3', color: '#fff6e1', font: '700 2.2vmin/1 var(--font-mono)' }} initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 1, duration: .4 }}>MIRROR TAB → VIEW PREMIUM TO MIRROR</motion.div>
      <motion.div style={{ position: 'absolute', right: '7%', top: '64%', width: '23vw', color: '#073d2d', font: '600 2.4vmin/1.35 var(--font-body)' }} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 1.6, duration: .4 }}>
        Upgrade for unlimited-time mirroring. There is no free mirror minute or rewarded mirror unlock.
      </motion.div>
      <motion.div style={{ position: 'absolute', left: '8%', right: '8%', bottom: '5%', textAlign: 'center', color: '#7352a3', font: '700 2.4vmin/1.3 var(--font-mono)' }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2.2, duration: .4 }}>
        PREMIUM ALSO INCLUDES BACKGROUND CASTING + UP TO 20 PHOTOS AND 20 VIDEOS
      </motion.div>
      <div className="fc-grain" />
    </section>
  );
}
