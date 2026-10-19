---
name: FrameCast native companion
description: The selected iOS and Android companion-app direction and its native WebRTC build constraint.
---

FrameCast's phone companion should be a true native iOS/Android app with QR scanning, five-digit room entry, and native photo/video selection. The user chose this over a browser wrapper. Native WebRTC requires a custom development build; Expo Go alone cannot run the casting transport.

For native file sending, use a direct WebRTC data channel. The TV buffers the complete transfer in memory, then starts playback; this is not progressive playback during transfer. Keep media out of signaling and server storage, clear temporary buffers after use, and check the TV-side size limit on real devices.

**Why:** The user explicitly chose native iOS and Android with a separate build path while retaining direct phone-to-TV privacy.

**How to apply:** Preserve the native companion and same-Wi-Fi peer-to-peer architecture. Do not claim Expo Go or physical-device compatibility until tested with custom builds on both platforms.
