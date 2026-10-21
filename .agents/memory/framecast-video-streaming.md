---
name: FrameCast instant video behavior
description: The user's preferred compatibility and playback tradeoff for long videos.
---

FrameCast supports photos and videos selected from the phone, direct video URLs, best-effort webpage detection, and ordinary YouTube video links via YouTube's official embedded player. Users commonly have YouTube share links rather than direct MP4 URLs. Never scrape or extract YouTube media streams. Distinguish URLs from webpages; do not imply every site works. The user explicitly approved on-device video preparation. Keep phone-selected media peer-to-peer and off FrameCast servers. Single-file browser video now prefers bounded real-time phone rendering into a WebRTC media stream so the TV receives already-upright frames. This requires the phone browser to decode the original; it does not bypass unsupported phone codecs or DRM.

**Why:** The user wants common YouTube links to play without finding hidden MP4 URLs, preserving direct phone-to-TV privacy, and explicitly opted into phone-side conversion. TV-side rotation can blank the picture despite continuing audio. Live phone rendering avoids a whole-film preparation wait, at a bounded mobile processing/quality cost; disclose compatibility-mode quality rather than claiming original-file fidelity.

**How to apply:** For YouTube, pass the ordinary video URL to the TV and use YouTube's official embedded player; the TV connects to YouTube directly. Do not extract signed streams, proxy, or store media. Explain embedding, sign-in, autoplay, and TV-browser restrictions. Other video URLs stay source-to-TV. Native phone video still prefers local Wi-Fi byte-range playback. Phone-browser file playback uses real-time phone-side rendering; do not silently fall back to whole-film remuxing or transfer when its source stream is unavailable. Keep the phone visible while rendering; do not promise arbitrary codec support or uninterrupted background capture.

Android website detection is an Android-only in-app browser that scans the top-level page's ordinary HTML video/source elements and public video metadata for HTTP(S) URLs. It does not inspect cross-origin frames or reverse-engineer blob, MSE, DRM, or hidden service streams. The TV fetches a user-selected source directly; the app must not upload or proxy media. Use a temporary/incognito WebView with caching disabled.

**Why:** The user chose an Android in-app browser detector to find site videos while keeping FrameCast's peer-to-peer/no-media-storage model. Generic extraction cannot reliably cover every site, and hidden stream extraction would undermine the agreed privacy and compatibility boundaries.

**How to apply:** Keep detection limited to openly exposed HTTP(S) sources, retain the official YouTube player path, and state when a site does not expose a TV-shareable source. For services such as TikTok that do not expose direct URLs, use an official player integration rather than scraping or bypassing protection.

Keep a phone-hosted HTTP receiver on the same origin as its local HTTP media, instead of embedding local HTTP video inside the cloud HTTPS page.

**Why:** Browser mixed-content restrictions can otherwise block an apparently valid local video URL. The user's comparison recording demonstrates the desired browser playback experience, but does not prove universal codec support or zero buffering.

**How to apply:** Pass only session/control metadata through cloud signaling. Keep local media and receiver on the phone; never add a cloud proxy to work around mixed content. A source-only change does not update an installed native app: rebuild it before claiming the new transport is available.

Some automation Chromium builds cannot decode H.264/AAC even when an MP4 is valid; generated VP8/Opus WebM can exercise the browser casting/recovery journey instead.

**Why:** A missing proprietary decoder can prevent peer creation entirely and must not be mistaken for an application reconnection defect.

**How to apply:** Check actual phone-preview decoding first, then confirm received video frames rather than only connection labels. Use supported generated fixtures for transport tests, and do not infer MP4, physical Samsung, or mobile OS background compatibility from a successful desktop WebM simulation.

Drive compatibility rendering from decoded video frames where available, using their media timestamps rather than jittery JavaScript callback arrival times. Prefer capturing each finished picture explicitly over independent drawing/capture clocks. A display-clock fallback must preserve timing phase rather than resetting its throttle after every draw.

**Why:** The user repeatedly reported soft, jerky TV playback even as the playback timer continued advancing, including after increasing HD targets. They later confirmed that the revised encoding played very smoothly and requested automatic quality increases up to 4K where possible, with lower quality when encoding struggles. A nominal frame-rate cap can silently deliver fewer, unevenly spaced pictures; increasing resolution or bitrate alone does not fix that. Full-resolution phone decoding plus canvas encoding also has a real processing cost. Moving file/control clocks do not prove pictures are being delivered smoothly.

**How to apply:** Preserve upright rendering and stable playlist tracks. Start conservatively and qualify higher resolution using actual encoder and TV decoder feedback; lower pixel work under CPU, network or decoder pressure before sacrificing motion, with recovery hysteresis. Prefer compatible hardware-friendly codecs without removing negotiated fallbacks or promising hardware acceleration. The user's later request supersedes the previous blanket Full HD ceiling: permit gradual, source-limited upgrades up to 4K only with positive rendering, encoding, receiver and connection headroom. Missing telemetry is not permission to force UHD, and an unsupported high tier must fall back without ending a working session. Do not present an upscale of an HD file as 4K detail. Describe targets, encoding and decoding statistics accurately, not as proof of displayed frames or original-file fidelity. Native phone direct-file Wi-Fi playback avoids browser re-encoding and remains the strongest original-quality approach; changing the TV player alone cannot remove phone-side processing.

The user wants phone-selected videos to form an ordered playlist: first one video, then the next automatically. Keep playlist playback within the existing TV session.

**Why:** Reopening the receiver for each item would interrupt the sequential experience and can lose the TV's native fullscreen state. The standing privacy requirement still applies to a playlist.

**How to apply:** Keep playlist selections on the phone for the current session, read only the item being played, and retain the receiver's playback connection across item boundaries. Do not upload the queue, prepare every movie before starting, or require another QR scan between items.

Videos should default to **Fit whole video**, not **Fill TV screen**. Do not show the separate phone **Preview muted / Preview sound** toggle.

**Why:** The user explicitly requested the complete video remain visible by default and asked to remove that preview button.

**How to apply:** Keep sender rendering, phone fit indicators, and TV presentation consistent with uncropped playback. Fullscreen must not imply cropping; black bars are acceptable when aspect ratios differ. Filling remains an explicit option. Preserve the separate controls for actual TV volume and mute.

For an Android phone video that the TV explicitly reports as an unsupported codec, FrameCast may automatically prepare a temporary H.264 MP4 on the phone and then start playback on the TV. Show conversion progress and state clearly that the original is unchanged and media is not uploaded. Convert only the selected item after the TV reports incompatibility; preserve AAC audio where supported. Keep generated copies in app cache and include them in the existing clear-data cleanup. Do not promise conversion when the phone cannot decode the source or storage is insufficient; report the reason. iOS needs its own native conversion path.

**Why:** The user chose private, on-device conversion instead of cloud processing and specifically asked customers to see that conversion is happening.

**How to apply:** Keep this fallback Android-only and limited to codec failures, not network or autoplay errors. Once conversion finishes, play the copy automatically through the existing direct phone-to-TV path. Never convert the whole playlist in advance or send the original or converted file to FrameCast servers.
