import { motion } from 'framer-motion';
import { PhoneMock } from './AppScreens';

function TvBrowser() {
  return (
    <div style={{ width: '87vw', padding: '1.3vmin', borderRadius: '4vmin', background: '#173f32', boxShadow: '0 3vmin 7vmin rgba(7,29,22,.25)' }}>
      <div style={{ borderRadius: '3vmin', overflow: 'hidden', background: '#f7f5ef' }}>
        <div style={{ height: '8vmin', padding: '0 2.5vmin', background: '#ece9df', display: 'flex', alignItems: 'center', gap: '1.3vmin' }}>
          {['#ca3f2c','#f3c74d','#72c34c'].map((color) => <span key={color} style={{ width: '1.7vmin', height: '1.7vmin', borderRadius: '50%', background: color }} />)}
          <div aria-label="https://2tx1.com" style={{ marginLeft: '2vmin', flex: 1, borderRadius: '99px', background: '#fcfaf5', padding: '1.5vmin 2vmin', color: '#202a37', font: '500 2.5vmin/1 var(--font-mono)' }}>
            <span style={{ color: '#78807b' }}>https://</span>
            {Array.from('2tx1.com').map((character, index) => (
              <motion.span key={`${character}-${index}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: .6 + index * .075, duration: .06 }}>
                {character}
              </motion.span>
            ))}
          </div>
          <span className="fc-micro" style={{ color: '#6b716f' }}>TV BROWSER</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4vmin 5vmin' }}>
          <div>
            <div style={{ font: '700 5vmin/1 var(--font-display)', color: '#202a37' }}>FrameCast</div>
            <div className="fc-sub" style={{ color: '#6b716f', marginTop: '2vmin' }}>Connect your phone</div>
            <div style={{ marginTop: '3vmin', padding: '1.8vmin 2.5vmin', borderRadius: '99px', background: '#e7f0e8', color: '#2b644d', font: '700 4.5vmin/1 var(--font-mono)', letterSpacing: '.18em' }}>48217</div>
          </div>
          <div style={{ width: '23vmin', height: '23vmin', padding: '1.5vmin', background: '#fcfaf5', border: '.3vmin solid #dfdad0', display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: '.35vmin' }}>
            {Array.from({ length: 49 }, (_, i) => <span key={i} style={{ background: [0,1,2,6,7,8,12,14,16,18,22,24,26,28,30,31,32,34,36,38,40,41,42,46,47,48].includes(i) ? '#173f32' : '#f7f5ef' }} />)}
          </div>
        </div>
      </div>
    </div>
  );
}

export function Scene2() {
  return (
    <section className="fc-scene" style={{ background: '#f7f0dc', color: '#073d2d', padding: '6vh 6vw' }}>
      <div className="fc-eyebrow" style={{ color: '#7352a3' }}>01 / PAIR YOUR DEVICES</div>
      <h2 className="fc-head" style={{ marginTop: '2vh', fontSize: '8.5vmin' }}>ONE TV VISIT.<br /><span style={{ color: '#f68b36' }}>THEN BACK TO THE APP.</span></h2>
      <motion.div style={{ position: 'absolute', top: '22%', left: '6%' }} initial={{ y: 24, opacity: 0, scale: .96 }} animate={{ y: 0, opacity: 1, scale: 1 }} transition={{ delay: .22, duration: .65 }}>
        <TvBrowser />
      </motion.div>
      <motion.div style={{ position: 'absolute', top: '51%', left: '14%', color: '#073d2d', background: '#f3c74d', borderRadius: '99px', padding: '1.3vmin 3vmin', font: '700 2.2vmin/1 var(--font-mono)' }} initial={{ scale: .7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: .9, type: 'spring', stiffness: 240, damping: 18 }}>TYPE 2tx1.com ON THE TV</motion.div>
      <motion.div style={{ position: 'absolute', top: '56%', right: '7%', zIndex: 2, background: '#f7f0dc', border: '.6vmin solid #7352a3', borderRadius: '50%', width: '13vmin', height: '13vmin', display: 'grid', placeItems: 'center', color: '#7352a3', font: '700 2.5vmin/1 var(--font-mono)' }} initial={{ scale: .3, rotate: -90, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} transition={{ delay: 1.5, duration: .55, type: 'spring', stiffness: 200 }}>48217</motion.div>
      <motion.div style={{ position: 'absolute', left: '14%', bottom: '8%' }} initial={{ y: 32, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 1.05, duration: .55 }}>
        <PhoneMock screen="join" style={{ width: '37vw' }} delay={.1} />
      </motion.div>
      <motion.div className="fc-sub" style={{ position: 'absolute', left: '58%', right: '7%', bottom: '22%', color: '#073d2d' }} initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 2.15, duration: .4 }}>
        Back in FrameCast: scan the TV QR code or enter its five-digit code.
      </motion.div>
      <div className="fc-grain" />
    </section>
  );
}
