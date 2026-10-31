import { motion } from 'framer-motion';
import { Eyebrow } from '../FrameParts';

const tiles = [
  { label: 'PHOTO', color: '#f3c74d', icon: '01', y: '29%', x: '7%', rotate: -8 },
  { label: 'VIDEO', color: '#e74f45', icon: '▶', y: '39%', x: '52%', rotate: 6 },
  { label: 'LINK', color: '#53a8d6', icon: '↗', y: '49%', x: '17%', rotate: -3 },
];

export function Scene3() {
  return (
    <section className="fc-scene" style={{ background: '#35274b', color: '#fff6e1' }}>
      <motion.div initial={{ opacity: 0, x: -25 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: .5 }}>
        <Eyebrow color="#f3c74d">02 / PICK</Eyebrow>
        <h2 className="fc-head" style={{ marginTop: '3vh', fontSize: '12vmin' }}>PICK<br />WHAT<br /><span style={{ color: '#f68b36' }}>PLAYS.</span></h2>
      </motion.div>
      <div style={{ position: 'absolute', inset: '27% 0 30%' }}>
        {tiles.map((tile, index) => (
          <motion.div key={tile.label} className="fc-media-card" style={{ left: tile.x, top: tile.y, transform: `rotate(${tile.rotate}deg)`, zIndex: index + 1, borderColor: tile.color }} initial={{ y: 90, scale: .5, opacity: 0, rotate: tile.rotate - 12 }} animate={{ y: 0, scale: 1, opacity: 1, rotate: tile.rotate }} transition={{ delay: .4 + index * .47, duration: .7, ease: [.18,.86,.24,1] }}>
            <div style={{ height: '100%', borderRadius: '2vmin', background: tile.label === 'PHOTO' ? 'linear-gradient(145deg,#74bed0 0 48%,#f3c74d 48% 53%,#2f6948 53%)' : tile.color, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '1.8vmin', color: '#073d2d' }}>
              <span className="fc-micro">{tile.icon}</span>
              <span className="fc-micro" style={{ fontWeight: 700 }}>{tile.label}</span>
            </div>
          </motion.div>
        ))}
        <motion.div style={{ position: 'absolute', left: '13%', right: '10%', bottom: '0%', display: 'flex', flexDirection: 'column', gap: '1.4vmin' }} initial={{ y: 45, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 1.75, duration: .5 }}>
          {['Photo · 01', 'Video · 02', 'Link · 03'].map((item, index) => <div key={item} className="fc-queue-card" style={{ marginLeft: `${index * 3}vw`, color: '#073d2d', font: '600 2.8vmin/1 var(--font-mono)' }}><span style={{ width: '2.5vmin', height: '2.5vmin', borderRadius: '.6vmin', background: ['#f3c74d','#e74f45','#53a8d6'][index] }} />{item}<span style={{ marginLeft: 'auto', color: '#8c8e7e' }}>{String(index + 1).padStart(2,'0')}</span></div>)}
        </motion.div>
      </div>
      <motion.div className="fc-sub" style={{ position: 'absolute', bottom: '8%', left: '8%', color: '#fff6e1' }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2.5 }}>Send only what you select.</motion.div>
      <motion.div className="fc-micro" style={{ position: 'absolute', bottom: '5%', left: '8%', color: '#c9bce1' }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 4.35, duration: .35 }}>LINKS OPEN FROM THEIR SOURCE ON TV</motion.div>
      <motion.div style={{ position: 'absolute', bottom: '4.5%', right: '-4%', width: '70vw', height: '.9vmin', background: '#f68b36', transformOrigin: 'right', rotate: -25 }} initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ delay: 4.15, duration: .65 }} />
      <div className="fc-grain" />
    </section>
  );
}
