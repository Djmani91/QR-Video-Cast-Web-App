---
name: FrameCast instant video behavior
description: The user's preferred compatibility and playback tradeoff for long videos.
---

When a video is selected, start TV playback while the phone continues sending it if the TV can play the stream. For unsupported containers/codecs, warn and stop early rather than silently waiting for a full-file transfer. Keep media peer-to-peer; do not add server-side storage, transcoding, or media relays.

**Why:** The user wants even long videos to begin without waiting for the complete file, chose immediate streaming for compatible videos, and asked for a warning for other formats while preserving direct phone-to-TV privacy.

**How to apply:** Prefer stream-ready fragmented MP4 with TV-supported H.264/AAC and Media Source Extensions. Explain that codec and TV-browser support vary; do not claim every MP4 is streamable or treat the user's choice as permission to upload or transcode media.
