import type { CSSProperties, ReactNode } from 'react';
import { motion } from 'framer-motion';

export function TvSet({ className = '', style = {} }: { className?: string; style?: CSSProperties }) {
  return (
    <div className={`fc-device-shadow ${className}`} style={style}>
      <div className="fc-tv">
        <div className="fc-tv-glass">{/* scene supplies its own screen art */}</div>
        <div className="fc-tv-stand" />
      </div>
    </div>
  );
}

export function PhoneSet({ className = '', style = {} }: { className?: string; style?: CSSProperties }) {
  return (
    <div className={`fc-device-shadow ${className}`} style={style}>
      <div className="fc-phone">
        <div className="fc-phone-notch" />
        <div className="fc-phone-screen">{/* scene supplies its own screen art */}</div>
      </div>
    </div>
  );
}

export function SignalLine({ color = '#f68b36', delay = 0 }: { color?: string; delay?: number }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 320 180" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }}>
      <motion.path
        d="M 12 154 C 92 38, 207 38, 308 24"
        fill="none"
        stroke={color}
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray="8 12"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1, strokeDashoffset: [0, -40] }}
        transition={{ pathLength: { delay, duration: 0.9, ease: 'easeOut' }, opacity: { delay, duration: 0.2 }, strokeDashoffset: { delay, duration: 2.5, repeat: Infinity, ease: 'linear' } }}
      />
    </svg>
  );
}

export function Eyebrow({ children, color = 'currentColor' }: { children: ReactNode; color?: string }) {
  return <div className="fc-eyebrow" style={{ color }}>{children}</div>;
}
