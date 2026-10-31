import { motion } from 'framer-motion';
import { Eyebrow } from '../FrameParts';

export function Scene5() {
  return (
    <section className="fc-scene" style={{ background: '#183e67', color: '#fff6e1' }}>
      <motion.div initial={{ opacity: 0, y: -18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .45 }}>
        <Eyebrow color="#f3c74d">04 / WATCH</Eyebrow>
        <h2 className="fc-head" style={{ marginTop: '2.5vh', fontSize: '9.2vmin' }}>MADE FOR<br />THE BIG<br /><span style={{ color: '#f3c74d' }}>SCREEN.</span></h2>
      </motion.div>
      <motion.div className="fc-device-shadow" style={{ position: 'absolute', top: '34%', left: '7%', width: '86%' }} initial={{ scale: .75, rotateX: 13, opacity: 0 }} animate={{ scale: 1, rotateX: 0, opacity: 1 }} transition={{ delay: .22, duration: .75, ease: [.18,.86,.24,1] }}>
        <div className="fc-tv" style={{ background: '#f7f0dc' }}>
          <div className="fc-tv-glass" style={{ height: '47vw', maxHeight: '24vh' }}>
            <motion.div className="fc-still" initial={{ scale: 1.12, x: '-4%' }} animate={{ scale: 1.02, x: '3%' }} transition={{ duration: 3.6, ease: 'linear' }} />
            <div className="fc-play" />
            <motion.div style={{ position: 'absolute', left: '7%', right: '7%', bottom: '7%', height: '.8vmin', background: 'rgba(255,246,225,.45)', zIndex: 4 }}><motion.div style={{ height: '100%', background: '#e74f45', transformOrigin: 'left' }} initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ delay: .9, duration: 3.2, ease: 'linear' }} /></motion.div>
          </div><div className="fc-tv-stand" />
        </div>
      </motion.div>
      <motion.div style={{ position: 'absolute', top: '65%', right: '3%', display: 'flex', alignItems: 'center', gap: '2vw', padding: '1.5vmin 2.5vmin', borderRadius: '2vmin', background: '#fff6e1', color: '#073d2d', boxShadow: '0 1.5vmin 3vmin rgba(0,0,0,.18)' }} initial={{ x: 60, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 1.25, duration: .5 }}>
        <div style={{ width: '10vw', height: '7vw', borderRadius: '1vmin', background: 'linear-gradient(145deg,#74bed0 0 46%,#f3c74d 46% 51%,#2e6445 51%)' }} />
        <div className="fc-micro">UP NEXT<br /><b>02 · SUMMER</b></div>
      </motion.div>
      <motion.div className="fc-micro" style={{ position: 'absolute', bottom: '12%', left: '10%', color: '#f3c74d' }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2.1 }}>NEXT UP, AUTOMATICALLY.</motion.div>
      <motion.div style={{ position: 'absolute', bottom: '5.5%', right: '8%', display: 'flex', gap: '1.2vmin' }} initial={{ scale: .75, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 2.85, duration: .55 }}>
        {[0,1,2].map((i) => <div key={i} style={{ width: '14vw', height: '11vw', borderRadius: '1.7vmin', background: ['linear-gradient(145deg,#f3c74d,#529b76)','linear-gradient(145deg,#53a8d6,#e74f45)','linear-gradient(145deg,#e74f45,#f3c74d)'][i], border: '.5vmin solid #fff6e1', transform: `rotate(${(i-1)*4}deg)` }} />)}
      </motion.div>
      <motion.div className="fc-sub" style={{ position: 'absolute', bottom: '2.6%', left: '10%', color: '#fff6e1' }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 3.15 }}>Browse a photo batch in-session.</motion.div>
      <div className="fc-grain" />
    </section>
  );
}
