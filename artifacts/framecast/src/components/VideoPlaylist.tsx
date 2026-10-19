import { useState } from 'react';
import { ArrowDown, ArrowUp, Play, Plus, SkipBack, SkipForward, X } from 'lucide-react';
import { MAX_PLAYLIST_ITEMS } from '../lib/video-playlist';
import './video-playlist.css';

export function VideoPlaylist({ files, activeIndex, busy, playing, onPlay, onMove, onRemove, onAdd }: {
  files: File[];
  activeIndex: number;
  busy: boolean;
  playing: boolean;
  onPlay: (index: number) => void;
  onMove: (from: number, to: number) => void;
  onRemove: (index: number) => void;
  onAdd: (files: File[]) => void;
}) {
  // Keep each used picker mounted: replacing input.files can revoke an Android
  // provider grant for videos that are still waiting in the playlist.
  const [pickers, setPickers] = useState([0]);
  const currentPicker = pickers.at(-1)!;
  return <section className="video-playlist" data-testid="video-playlist" aria-label="Video playlist">
    <div className="playlist-heading">
      <div><strong>Video playlist</strong><p>{playing ? 'Playing' : 'Selected'} {activeIndex + 1} of {files.length} · plays in order</p></div>
      <button type="button" className="button-secondary" disabled={busy || files.length >= MAX_PLAYLIST_ITEMS}
        onClick={() => document.getElementById(`playlist-picker-${currentPicker}`)?.click()} data-testid="button-add-playlist-videos">
        <Plus size={15} /> Add videos
      </button>
    </div>
    {pickers.map((id) => <input key={id} id={`playlist-picker-${id}`} type="file" accept="video/*" multiple className="hidden-file"
      aria-label="Add videos to playlist" data-testid={id === currentPicker ? 'input-add-playlist-videos' : undefined}
      onChange={(event) => {
        const added = Array.from(event.currentTarget.files ?? []);
        if (!added.length) return;
        setPickers(current => [...current, current.at(-1)! + 1]);
        onAdd(added);
      }} />)}
    <div className="playlist-navigation">
      <button type="button" className="button-secondary" disabled={busy || activeIndex <= 0} onClick={() => onPlay(activeIndex - 1)} data-testid="button-playlist-previous"><SkipBack size={15} /> Previous</button>
      <button type="button" className="button-secondary" disabled={busy || activeIndex >= files.length - 1} onClick={() => onPlay(activeIndex + 1)} data-testid="button-playlist-next">Next <SkipForward size={15} /></button>
    </div>
    <ol className="playlist-items">
      {files.map((file, index) => <li key={`${file.name}-${file.lastModified}-${index}`} className={index === activeIndex ? 'playlist-item active' : 'playlist-item'} aria-current={index === activeIndex ? 'true' : undefined} data-testid={`playlist-item-${index}`}>
        <button type="button" className="playlist-select" disabled={busy} onClick={() => onPlay(index)} aria-label={`Play video ${index + 1}: ${file.name}`} data-testid={`button-playlist-play-${index}`}>
          <span className="playlist-number">{index === activeIndex && playing ? <Play size={13} /> : index + 1}</span>
          <span className="playlist-name" title={file.name}>{file.name}</span>
        </button>
        <div className="playlist-item-actions">
          <button type="button" disabled={busy || index === 0} aria-label={`Move video ${index + 1} up`} onClick={() => onMove(index, index - 1)}><ArrowUp size={16} /></button>
          <button type="button" disabled={busy || index === files.length - 1} aria-label={`Move video ${index + 1} down`} onClick={() => onMove(index, index + 1)}><ArrowDown size={16} /></button>
          <button type="button" disabled={busy} aria-label={`Remove video ${index + 1}`} onClick={() => onRemove(index)}><X size={16} /></button>
        </div>
      </li>)}
    </ol>
    <p className="playlist-note">The next video starts automatically. Keep this phone page open. Your playlist stays on this phone and is cleared when you disconnect or close the page.</p>
    {busy && <p role="status">Opening video…</p>}
  </section>;
}
