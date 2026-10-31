import { motion } from 'framer-motion';
import type { CSSProperties } from 'react';
import { Eyebrow } from '../FrameParts';

export function Scene4() {
  return (
    <section className="fc-scene" style={{ background: '#f7f0dc', color: '#073d2d' }}>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: .3 }}>
        <Eyebrow>03 / CONNECT</Eyebrow>
        <h2 className="fc-head" style={{ marginTop: '2vh', fontSize: '9.1vmin' }}>DIRECT.<br />DEVICE TO<br />DEVICE.</h2>
      </motion.div>
      <div style={{ position: 'absolute', inset: '27% 0 15%' }}>
        <motion.div style={{ position: 'absolute', left: '6%', top: '1%', width: '44vw', height: '68vw', borderRadius: '6vmin', padding: '1.2vmin', background: '#073d2d', boxShadow: '0 3vmin 6vmin rgba(7,61,45,.22)' }} initial={{ x: -50, rotate: -7, opacity: 0 }} animate={{ x: 0, rotate: -7, opacity: 1 }} transition={{ delay: .2, duration: .65 }}>
          <div style={{ width: '100%', height: '100%', borderRadius: '4.8vmin', background: '#e8dfc7', padding: '8vmin 2vmin 2vmin', position: 'relative', overflow: 'hidden' }}>
            <div style={{ width: '100%', height: '45%', borderRadius: '2vmin', background: 'linear-gradient(145deg,#74bed0 0 45%,#f3c74d 45% 50%,#2e6445 50%)' }} />
            <div style={{ marginTop: '2vmin', height: '1vmin', width: '78%', borderRadius: '2vmin', background: '#aeb09f' }} />
            <div style={{ marginTop: '1.4vmin', height: '1vmin', width: '56%', borderRadius: '2vmin', background: '#c4c3b0' }} />
          </div>
        </motion.div>
        <motion.div className="fc-device-shadow" style={{ position: 'absolute', right: '5%', top: '16%', width: '58%' }} initial={{ x: 55, scale: .85, opacity: 0 }} animate={{ x: 0, scale: 1, opacity: 1 }} transition={{ delay: .42, duration: .7 }}>
          <div className="fc-tv">
            <div className="fc-tv-glass">
              <div className="fc-still" />
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(120deg,transparent 25%,rgba(255,246,225,.3) 48%,transparent 71%)' }} />
            </div><div className="fc-tv-stand" />
          </div>
        </motion.div>
        <svg viewBox="0 0 320 240" style={{ position: 'absolute', inset: '10% 0 auto', width: '100%', height: '68%', overflow: 'visible' }}>
          <motion.path d="M 95 170 C 145 120, 170 110, 230 85" fill="none" stroke="#f68b36" strokeWidth="5" strokeLinecap="round" strokeDasharray="8 11" initial={{ pathLength: 0 }} animate={{ pathLength: 1, strokeDashoffset: [0,-38] }} transition={{ pathLength: { delay: .8, duration: .9 }, strokeDashoffset: { delay: 1.7, duration: 2.5, repeat: Infinity, ease: 'linear' } }} />
          {[0,1,2,3].map((n) => <motion.circle key={n} cx="0" cy="0" r="5" fill={['#7352a3','#e74f45','#53a8d6','#f3c74d'][n]} initial={{ offsetDistance: '0%' }} animate={{ offsetDistance: '100%' }} transition={{ delay: 1 + n * .32, duration: 1.45, repeat: Infinity, ease: 'linear' }} style={{ offsetPath: 'path(\"M 95 170 C 145 120, 170 110, 230 85\")' } as CSSProperties} />)}
        </svg>
      </div>
      <div style={{ position: 'absolute', left: '10%', bottom: '13%', right: '10%', textAlign: 'center' }}>
        <motion.p className="fc-sub" style={{ margin: '0 0 1.5vh' }} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.4, duration: .5 }}>Selected media travels directly.</motion.p>
        <motion.div className="fc-micro" style={{ color: '#7352a3' }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2.3 }}>NO MEDIA UPLOAD TO FRAMECAST</motion.div>
      </div>
      <div className="fc-grain" />
    </section>
  );
}
