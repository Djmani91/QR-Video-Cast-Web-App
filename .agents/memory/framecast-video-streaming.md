---
name: FrameCast instant video behavior
description: The user's preferred compatibility and playback tradeoff for long videos.
---

FrameCast supports photos and videos selected from the phone, direct video URLs, best-effort webpage detection, and ordinary YouTube video links via YouTube's official embedded player. Users commonly have YouTube share links rather than direct MP4 URLs. Never scrape or extract YouTube media streams. Distinguish URLs from webpages; do not imply every site works. The user explicitly approved on-device video preparation. Keep phone-selected media peer-to-peer and off FrameCast servers. Single-file browser video now prefers bounded real-time phone rendering into a WebRTC media stream so the TV receives already-upright frames. This requires the phone browser to decode the original; it does not bypass unsupported phone codecs or DRM.

**Why:** The user wants common YouTube links to play without finding hidden MP4 URLs, preserving direct phone-to-TV privacy, and explicitly opted into phone-side conversion. TV-side rotation can blank the picture despite continuing audio. Live phone rendering avoids a whole-film preparation wait, at a bounded mobile processing/quality cost; disclose compatibility-mode quality rather than claiming original-file fidelity.

**How to apply:** For YouTube, pass the ordinary video URL to the TV and use YouTube's official embedded player; the TV connects to YouTube directly. Do not extract signed streams, proxy, or store media. Explain embedding, sign-in, autoplay, and TV-browser restrictions. Other video URLs stay source-to-TV. Native phone video still prefers local Wi-Fi byte-range playback. Phone-browser file playback can use real-time phone-side rendering, with retained bounded remux/full-transfer paths where appropriate. Keep the phone visible while rendering; do not promise arbitrary codec support or uninterrupted background capture.

Keep a phone-hosted HTTP receiver on the same origin as its local HTTP media, instead of embedding local HTTP video inside the cloud HTTPS page.

**Why:** Browser mixed-content restrictions can otherwise block an apparently valid local video URL. The user's comparison recording demonstrates the desired browser playback experience, but does not prove universal codec support or zero buffering.

**How to apply:** Pass only session/control metadata through cloud signaling. Keep local media and receiver on the phone; never add a cloud proxy to work around mixed content. A source-only change does not update an installed native app: rebuild it before claiming the new transport is available.
