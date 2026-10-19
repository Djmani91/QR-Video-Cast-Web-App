---
name: FrameCast instant video behavior
description: The user's preferred compatibility and playback tradeoff for long videos.
---

FrameCast supports photos and videos selected from the phone, plus direct video URLs and best-effort webpage detection. Distinguish URLs from webpages; do not imply every site works. For local videos, stream immediately when the TV can play the format. If instant streaming is unavailable, allow direct full-file transfer for smaller clips (currently capped at 128 MB) and start playback when complete. Warn and stop for larger non-streamable files or unsupported TV codecs rather than silently waiting. Keep all media peer-to-peer; do not store, transcode, or relay it through FrameCast.

**Why:** The user wants broad phone-video compatibility and direct phone-to-TV privacy. Their latest request overrides the earlier preference to stop every non-streamable file immediately, but does not authorize an on-device conversion feature that can consume significant battery and time.

**How to apply:** For URL casting, have the TV fetch media directly from its source; do not proxy or store it. Explain site, login, DRM, codec, and TV-browser limits. For local files, try direct streaming first, then use a bounded full-transfer fallback for small files. Keep on-device conversion off unless the user explicitly opts into its battery/time tradeoffs.
