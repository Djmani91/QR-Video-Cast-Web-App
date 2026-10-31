import type { CSSProperties, ReactNode } from 'react';
import { motion } from 'framer-motion';

export type AppScreen =
  | 'join'
  | 'photoPicker'
  | 'photos'
  | 'videoPicker'
  | 'videos'
  | 'player'
  | 'mirror'
  | 'premium'
  | 'permission'
  | 'mirrorActive'
  | 'background'
  | 'disconnect';

 function Header({ paired = false, activeTab }: { paired?: boolean; activeTab?: 'Images' | 'Videos' | 'URL' | 'Mirror' }) {
  return (
    <>
      <div className="app-topbar">
        <span className="app-mark">
          <svg aria-hidden="true" viewBox="0 0 24 24" width="4vmin" height="4vmin" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="m8 4 4 3 4-3" />
            <rect x="3" y="8" width="18" height="12" rx="2.3" />
            <path d="M7 20h10" />
          </svg>
        </span>
        <span className="app-brand">framecast</span>
        <span className="app-private">{paired ? 'TV PAIRED' : '◉ PRIVATE'}</span>
        <span className="app-settings">⚙</span>
      </div>
      {paired && (
        <div className="app-tabs">
          <div data-tab="Images" className={`app-tab${activeTab === 'Images' ? ' active' : ''}`}>▧<br />Images</div>
          <div data-tab="Videos" className={`app-tab${activeTab === 'Videos' ? ' active' : ''}`}>▸<br />Videos</div>
          <div data-tab="URL" className={`app-tab${activeTab === 'URL' ? ' active' : ''}`}>↗<br />URL</div>
          <div data-tab="Mirror" className={`app-tab${activeTab === 'Mirror' ? ' active' : ''}`}>▯<br />Mirror</div>
        </div>
      )}
    </>
  );
}

function Action({ icon, title, subtitle }: { icon: string; title: string; subtitle: string }) {
  return (
    <div className="app-action">
      <div className="app-action-icon">{icon}</div>
      <div>
        <div className="app-action-title">{title}</div>
        <div className="app-action-sub">{subtitle}</div>
      </div>
      <span style={{ marginLeft: 'auto', color: '#6b716f', fontSize: '3vmin' }}>›</span>
    </div>
  );
}

function PickerScreen({ kind }: { kind: 'photo' | 'video' }) {
  const images = kind === 'photo';
  return (
    <>
      <Header paired activeTab={images ? 'Images' : 'Videos'} />
      <div className="app-body">
        <div className="app-chip">● &nbsp; TV paired</div>
        <div className="app-title" style={{ marginTop: '2vmin' }}>Choose what to play.</div>
        <div className="app-action" style={{ marginTop: '4vmin', minHeight: '17vmin', padding: '2.5vmin' }}>
          <div className="app-action-icon" style={{ width: '9vmin', height: '9vmin', flexBasis: '9vmin', fontSize: '5vmin' }}>{images ? '▧' : '▶'}</div>
          <div style={{ minWidth: 0 }}>
            <div className="app-action-title">{images ? 'Choose one photo free' : 'Choose one video free'}</div>
            <div className="app-action-sub" style={{ marginTop: '1.3vmin' }}>One is free; watch an ad for one more. Premium unlocks more.</div>
          </div>
          <span style={{ marginLeft: 'auto', color: '#6b716f', fontSize: '3vmin' }}>›</span>
        </div>
      </div>
    </>
  );
}

function JoinScreen() {
  return (
    <>
      <Header />
      <div className="app-body">
        <div className="app-title">Connect to your TV</div>
        <div className="app-copy">Open FrameCast in the TV browser, then scan its QR code or enter the five-digit code.</div>
        <div className="app-card">
          <div className="app-card-label">TV BROWSER ADDRESS</div>
          <div className="app-address">2tx1.com</div>
        </div>
        <Action icon="⌁" title="Find TVs on Wi-Fi" subtitle="Phone and TV must use the same Wi-Fi" />
        <Action icon="▦" title="Scan TV code" subtitle="Use your phone camera" />
        <div className="app-divider">OR ENTER THE 5-DIGIT CODE</div>
        <div className="app-code"><span>4</span><span>8</span><span>2</span><span>1</span><span>7</span></div>
        <div className="app-button" style={{ marginTop: '2vmin' }}>↗ &nbsp; Connect to TV</div>
      </div>
    </>
  );
}

function PhotosScreen() {
  return (
    <>
      <Header paired activeTab="Images" />
      <div className="app-body">
        <div className="app-chip">● &nbsp; Connected · Playing on TV</div>
        <div className="app-title" style={{ marginTop: '2vmin' }}>Your photos are on the TV.</div>
        <div className="app-copy">Browse and zoom the photos on the TV from here.</div>
        <div className="app-playlist" style={{ marginTop: '2vmin' }}>
          <div style={{ position: 'relative', height: '23vmin', overflow: 'hidden', borderRadius: '2vmin', background: 'linear-gradient(145deg,#78b9c1 0 45%,#eed379 45% 52%,#4d7859 52%)' }}>
            <div className="app-chip" style={{ position: 'absolute', top: '1.4vmin', left: '1.4vmin' }}>PHOTO 1 / 3</div>
            <div className="app-action-title" style={{ position: 'absolute', left: '2vmin', right: '2vmin', bottom: '1.5vmin', padding: '1.5vmin', background: '#fcfaf5e8', borderRadius: '1.5vmin' }}>photo_01.jpg <span style={{ float: 'right', color: '#2b644d' }}>Playing</span></div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2vmin' }}>
            <div><div className="app-card-label" style={{ color: '#202a37' }}>PLAYLIST</div><div className="app-action-sub">3 items · tap one to play</div></div>
            <div style={{ display: 'flex', gap: '1vmin' }}><div className="app-control">＋ Add</div><div className="app-control">Change</div></div>
          </div>
          <div className="app-grid" style={{ gridTemplateColumns: 'repeat(3,1fr)', marginTop: '1.5vmin' }}>
            <div className="app-thumb" style={{ border: '.5vmin solid #2b644d' }} />
            <div className="app-thumb" />
            <div className="app-thumb" />
          </div>
        </div>
      </div>
    </>
  );
}

function VideosScreen({ playback = false }: { playback?: boolean }) {
  return (
    <>
      <Header paired activeTab="Videos" />
      <div className="app-body">
        <div className="app-title">{playback ? 'Playing on the TV.' : 'Choose what to play.'}</div>
        <div className="app-copy">{playback ? 'The TV is playing directly from your phone. Keep FrameCast open while it plays.' : 'Choose a video from your phone.'}</div>
        <div className="app-card">
          <div style={{ height: '20vmin', borderRadius: '2vmin', background: 'linear-gradient(145deg,#78b9c1 0 43%,#eed379 43% 50%,#4d7859 50%)', position: 'relative', display: 'grid', placeItems: 'center', color: '#fcfaf5', fontSize: '7vmin' }}>▶</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2vmin' }}>
            <div><div className="app-action-title">summer_trip.mp4</div><div className="app-action-sub">02:18 · 148 MB</div></div>
            <span className="app-chip">VIDEO 1 / 2</span>
          </div>
          <div className="app-playlist">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div><div className="app-card-label">PLAYLIST</div><div className="app-action-sub">2 items · tap one to play</div></div>
              <div style={{ display: 'flex', gap: '1vmin' }}><div className="app-control">＋ Add</div><div className="app-control">Change</div></div>
            </div>
            <div className="app-playline"><div className="app-mini-image" /><div><div className="app-action-title">summer_trip.mp4</div><div className="app-action-sub">Playing · 02:18</div></div><b style={{ marginLeft: 'auto', color: '#2b644d' }}>●</b></div>
            <div className="app-playline"><div className="app-mini-image" style={{ background: 'linear-gradient(145deg,#c76843,#edc16a 48%,#34644f 49%)' }} /><div><div className="app-action-title">lake_day.mp4</div><div className="app-action-sub">Up next</div></div></div>
          </div>
        </div>
        {playback ? (
          <>
            <div className="app-control-row">
              <div className="app-control" style={{ padding: '1vmin 2vmin' }}>‹ Previous</div>
              <div className="app-control" style={{ padding: '1vmin 2vmin' }}>Next ›</div>
            </div>
            <div className="app-control-row"><div className="app-control">−10s</div><div className="app-control primary">Ⅱ Pause</div><div className="app-control">+10s</div></div>
            <div className="app-slider" />
            <div className="app-control-row"><div className="app-control">Vol−</div><div className="app-control">Vol+</div><div className="app-control">Mute</div><div className="app-control app-red">Stop</div></div>
            <div className="app-note">Timeline seek · previous / next playlist item</div>
          </>
        ) : null}
      </div>
    </>
  );
}

function MirrorScreen({ mode }: { mode: 'mirror' | 'permission' | 'mirrorActive' }) {
  if (mode === 'permission') {
    return (
      <>
        <Header paired activeTab="Mirror" />
        <div className="app-body">
          <div className="app-mirror">
            <div style={{ fontSize: '9vmin', color: '#536fa8' }}>▣</div>
            <div className="app-title" style={{ marginTop: '2vmin' }}>Start screen capture?</div>
            <div className="app-copy">FrameCast will have access to everything visible on your screen.</div>
            <div className="app-permission">Your screen, including notifications, may appear on the TV.</div>
            <div className="app-button app-purple">Start now</div>
            <div className="app-note">Android screen-capture permission · required</div>
          </div>
        </div>
      </>
    );
  }
  if (mode === 'mirrorActive') {
    return (
      <>
        <Header paired activeTab="Mirror" />
        <div className="app-body">
          <div className="app-chip">● &nbsp; SCREEN MIRRORING</div>
          <div className="app-title" style={{ marginTop: '2vmin' }}>Your screen is on the TV.</div>
          <div className="app-mirror" style={{ marginTop: '3vmin' }}>
            <div style={{ fontSize: '12vmin', color: '#2b644d' }}>▯</div>
            <div className="app-action-title">Mirroring active</div>
            <div className="app-action-sub">Audio from supported apps may be sent.</div>
          </div>
          <div className="app-note">Protected apps may block video or audio. FrameCast does not record microphone audio.</div>
          <div className="app-button app-red" style={{ marginTop: '4vmin' }}>■ &nbsp; Stop mirroring</div>
        </div>
      </>
    );
  }
  return (
    <>
      <Header paired activeTab="Mirror" />
      <div className="app-body">
        <div className="app-title">Mirror your phone screen</div>
        <div className="app-copy">Premium lets you mirror other apps while FrameCast runs in the background.</div>
        <div className="app-mirror" style={{ marginTop: '3vmin' }}>
          <div style={{ fontSize: '12vmin', color: '#2b644d' }}>▯</div>
          <div className="app-action-title">Android screen mirroring</div>
          <div className="app-action-sub">Premium feature</div>
          <div className="app-button app-purple" style={{ marginTop: '3vmin' }}>View Premium to mirror</div>
        </div>
        <div className="app-card">
          <div className="app-card-label">PREMIUM INCLUDES</div>
          <div className="app-note">Mirror your screen without time limits or rewarded ads.</div>
        </div>
      </div>
    </>
  );
}

function PremiumScreen() {
  return (
    <>
      <div className="app-topbar" style={{ marginBottom: '2vmin' }}>
        <span className="app-mark">
          <svg aria-hidden="true" viewBox="0 0 24 24" width="4vmin" height="4vmin" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="m8 4 4 3 4-3" />
            <rect x="3" y="8" width="18" height="12" rx="2.3" />
            <path d="M7 20h10" />
          </svg>
        </span>
        <span className="app-brand">framecast</span>
      </div>
      <div className="app-body">
        <div className="app-chip app-purple">✦ &nbsp; PREMIUM ACCESS</div>
        <div className="app-title" style={{ marginTop: '2vmin' }}>Choose how to use FrameCast</div>
        <div className="app-copy">Premium for background casting and ad-free access, or continue with ads.</div>
        <div className="app-card" style={{ marginTop: '3vmin' }}>
          <div className="app-action-title">FrameCast Premium</div>
          <div className="app-action-sub">No ads or rewarded unlocks</div>
          <div className="app-note">✓ Up to 20 photos and 20 videos per TV session</div>
          <div className="app-note">✓ Keep casting while you use other apps</div>
          <div className="app-note">✓ Mirror your screen without time limits or rewarded ads</div>
        </div>
        <div className="app-button app-purple" style={{ marginTop: '2vmin' }}>Get FrameCast Premium</div>
        <div className="app-button" style={{ marginTop: '1.5vmin', background: '#ece9df', color: '#202a37' }}>Continue with ads</div>
        <div className="app-note" style={{ textAlign: 'center' }}>Google Play confirms price and billing before approval.</div>
      </div>
    </>
  );
}

function BackgroundScreen() {
  return (
    <>
      <Header paired activeTab="Images" />
      <div className="app-body" style={{ marginTop: '3vmin' }}>
        <div className="app-title">Settings</div>
        <div className="app-card">
          <div className="app-card-label" style={{ color: '#2b644d' }}>BACKGROUND CASTING</div>
          <div className="app-action-title" style={{ marginTop: '1.5vmin' }}>Keep the TV connected in the background</div>
          <div className="app-action-sub">Turns on automatically when you connect to a TV. Android keeps a casting notification visible.</div>
          <div className="app-chip" style={{ marginTop: '2vmin', color: '#2b644d' }}>● &nbsp; Automatic</div>
        </div>
        <div className="app-card" style={{ background: '#e9edf6' }}>
          <div className="app-card-label" style={{ color: '#536fa8' }}>PREMIUM</div>
          <div className="app-action-title" style={{ marginTop: '1.2vmin' }}>Casting continues while you use other apps.</div>
        </div>
      </div>
      <div className="app-notification" style={{ position: 'absolute', left: '4%', right: '4%', bottom: '6%', zIndex: 3 }}>
        <div className="app-notification-icon">▣</div>
        <div><div className="app-action-title">FrameCast · Casting</div><div className="app-action-sub">Connected to TV · Tap to return</div></div>
      </div>
    </>
  );
}

function DisconnectScreen() {
  return (
    <>
      <Header paired activeTab="Images" />
      <div className="app-body">
        <div className="app-chip">● &nbsp; Connected · Playing on TV</div>
        <div className="app-title" style={{ marginTop: '3vmin' }}>Your photos are on the TV.</div>
        <div className="app-copy">Browse and zoom the photos on the TV from here.</div>
        <div className="app-card" style={{ marginTop: '4vmin', minHeight: '22vmin', display: 'grid', placeItems: 'center' }}>
          <div className="app-mini-image" style={{ width: '28vmin', height: '17vmin' }} />
        </div>
        <div className="app-button app-red" style={{ marginTop: '4vmin' }}>↯ &nbsp; Disconnect from this TV</div>
        <div className="app-note">Ends this connection and stops the current TV session.</div>
      </div>
    </>
  );
}

export function PhoneMock({ screen, style, delay = 0 }: { screen: AppScreen; style?: CSSProperties; delay?: number }) {
  let content: ReactNode;
  switch (screen) {
    case 'join': content = <JoinScreen />; break;
    case 'photoPicker': content = <PickerScreen kind="photo" />; break;
    case 'photos': content = <PhotosScreen />; break;
    case 'videoPicker': content = <PickerScreen kind="video" />; break;
    case 'videos': content = <VideosScreen />; break;
    case 'player': content = <VideosScreen playback />; break;
    case 'mirror':
    case 'permission':
    case 'mirrorActive': content = <MirrorScreen mode={screen} />; break;
    case 'premium': content = <PremiumScreen />; break;
    case 'background': content = <BackgroundScreen />; break;
    case 'disconnect': content = <DisconnectScreen />; break;
  }
  return (
    <motion.div
      className="app-phone"
      style={style}
      initial={{ opacity: 0, y: 24, scale: .96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay, duration: .55, ease: [.18,.86,.24,1] }}
    >
      <div className="app-speaker" />
      <div className="app-screen" data-screen={screen}>{content}</div>
    </motion.div>
  );
}

