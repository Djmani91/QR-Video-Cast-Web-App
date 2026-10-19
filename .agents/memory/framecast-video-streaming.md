---
name: FrameCast instant video behavior
description: The user's preferred compatibility and playback tradeoff for long videos.
---

FrameCast's casting scope is photos and videos selected from the phone; do not add website-video casting unless requested. When a video is selected, start TV playback while the phone continues sending it if the TV can play the stream. For unsupported containers/codecs, warn and stop early rather than silently waiting for a full-file transfer. Keep media peer-to-peer; do not add server-side storage, transcoding, or media relays.

**Why:** The user chose phone photos/videos as the content scope, wants even long videos to begin without waiting for the complete file, and asked for a warning for other formats while preserving direct phone-to-TV privacy.

**How to apply:** Prefer stream-ready fragmented MP4 with TV-supported H.264/AAC and Media Source Extensions. Explain that codec and TV-browser support vary; do not claim every MP4 is streamable or treat the user's uncertainty about conversion as permission to transcode. Keep conversion off by default unless the user opts in.
