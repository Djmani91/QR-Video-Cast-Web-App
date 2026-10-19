---
name: FrameCast instant video behavior
description: The user's preferred compatibility and playback tradeoff for long videos.
---

FrameCast supports photos and videos selected from the phone, plus direct video URLs and best-effort webpage detection. Distinguish URLs from webpages; do not imply every site works. The user explicitly approved on-device video preparation. Keep media peer-to-peer and off FrameCast servers. Current preparation remuxes supported MP4/MOV containers into fragmented MP4 without re-encoding; it cannot make an unsupported codec or DRM-protected file playable.

**Why:** The user wants broad phone-video compatibility and direct phone-to-TV privacy, and explicitly opted into phone-side conversion. Avoid changing codec quality or sending media to a server.

**How to apply:** For URL casting, have the TV fetch media directly from its source; do not proxy or store it. Explain site, login, DRM, codec, and TV-browser limits. For local MP4/MOV files, prefer lossless on-device remuxing to fMP4 for direct streaming. Keep bounded full-transfer fallback for small files, and do not claim arbitrary codec transcoding.
