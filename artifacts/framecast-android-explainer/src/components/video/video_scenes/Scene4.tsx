import { motion } from 'framer-motion';
import { PhoneMock } from './AppScreens';

export function Scene4() {
  return (
    <section className="fc-scene" style={{ background: '#183e67', color: '#fff6e1', padding: '5vh 6vw' }}>
      <div className="fc-eyebrow" style={{ color: '#f3c74d' }}>03 / VIDEOS</div>
      <h2 className="fc-head" style={{ marginTop: '1.5vh', fontSize: '8.6vmin' }}>PLAY ON TV.<br /><span style={{ color: '#f3c74d' }}>CONTROL FROM PHONE.</span></h2>
      <motion.div
        style={{ position: 'absolute', left: '6%', top: '24%', zIndex: 2 }}
        initial={{ opacity: 0, scale: .92, y: 20 }}
        animate={{ opacity: [1, 1, 0, 0], scale: 1, y: 0 }}
        transition={{ delay: .28, duration: 9, times: [0, .16, .24, 1] }}
      >
        <PhoneMock screen="videoPicker" style={{ width: '57vw' }} />
      </motion.div>
      <motion.div
        style={{ position: 'absolute', left: '6%', top: '24%', zIndex: 2 }}
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0, 1, 1] }}
        transition={{ delay: .28, duration: 9, times: [0, .16, .24, 1] }}
      >
        <PhoneMock screen="player" style={{ width: '57vw' }} />
      </motion.div>
      <motion.div style={{ position: 'absolute', right: '7%', top: '62%', width: '31vw', color: '#fff6e1' }} initial={{ opacity: 0, x: 15 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 1.4, duration: .4 }}>
        <div className="fc-micro" style={{ color: '#f3c74d' }}>PHONE REMOTE</div>
        <div style={{ marginTop: '1.4vh', font: '600 2.7vmin/1.3 var(--font-body)' }}>Play / pause. Seek the timeline. Skip −10 or +10 seconds. Change volume, stop, or choose the next playlist video.</div>
      </motion.div>
      <motion.div style={{ position: 'absolute', right: '8%', bottom: '13%', color: '#f3c74d', font: '700 2.3vmin/1.2 var(--font-mono)' }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2.2 }}>NEXT UP → PLAYLIST</motion.div>
      <div className="scene-caption" style={{ bottom: '4%' }}>
        <div className="scene-caption-main">Photos: browse and zoom on the TV from your phone.</div>
        <div className="scene-caption-detail" style={{ color: '#f3c74d' }}>FREE 1 VIDEO · REWARDED AD 1 MORE · PREMIUM UP TO 20</div>
      </div>
      <div className="fc-grain" />
    </section>
  );
}
