---
name: FrameCast instant video behavior
description: The user's preferred compatibility and playback tradeoff for long videos.
---

FrameCast supports photos and videos selected from the phone, direct video URLs, best-effort webpage detection, and ordinary YouTube video links via YouTube's official embedded player. Users commonly have YouTube share links rather than direct MP4 URLs. Never scrape or extract YouTube media streams. Distinguish URLs from webpages; do not imply every site works. The user explicitly approved on-device video preparation. Keep phone-selected media peer-to-peer and off FrameCast servers. Current preparation remuxes supported MP4/MOV containers into fragmented MP4 without re-encoding; it cannot make an unsupported codec or DRM-protected file playable.

**Why:** The user wants common YouTube links to play without finding hidden MP4 URLs, while preserving direct phone-to-TV privacy, and explicitly opted into phone-side conversion. Avoid changing codec quality, extracting protected streams, or sending media to a server.

**How to apply:** For YouTube, pass the ordinary video URL to the TV and use YouTube's official embedded player; the TV connects to YouTube directly. Do not extract signed streams, proxy, or store media. Explain that embedding, sign-in, autoplay, and TV-browser restrictions can still block some videos. For other URL casting, have the TV fetch media directly from its source. For local MP4/MOV files, prefer lossless on-device remuxing to fMP4 for direct streaming. Keep bounded full-transfer fallback for small files, and do not claim arbitrary codec transcoding.
