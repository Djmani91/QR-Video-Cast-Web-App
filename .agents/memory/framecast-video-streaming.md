---
name: FrameCast instant video behavior
description: The user's preferred compatibility and playback tradeoff for long videos.
---

FrameCast supports photos and videos selected from the phone, and the user has now requested URL-based video casting. Distinguish direct media URLs from webpage links that require video detection; do not imply every site works. When a local video is selected, start TV playback while the phone continues sending it if the TV can play the stream. For unsupported containers/codecs, warn and stop early rather than silently waiting for a full-file transfer. Keep media peer-to-peer; do not add server-side storage, transcoding, or media relays.

**Why:** The user wants even long local videos to begin without waiting for the complete file, asked for a warning for unsupported formats, and has requested casting videos from links while preserving direct phone-to-TV privacy.

**How to apply:** For URL casting, prefer having the TV fetch the media directly from its source; do not proxy or store media. Confirm whether the source is a direct media URL or a webpage before implementing detection. Explain codec, login, DRM, and TV-browser limits. For local files, prefer stream-ready fragmented MP4 with TV-supported H.264/AAC and warn when unsupported; keep conversion off by default unless the user opts in.
