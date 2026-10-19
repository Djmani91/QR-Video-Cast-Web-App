---
name: FrameCast native companion
description: The selected iOS and Android companion-app direction and its native WebRTC build constraint.
---

FrameCast's phone companion should be a true native iOS/Android app with QR scanning, five-digit room entry, and native photo/video selection. The user chose this over a browser wrapper. Native WebRTC requires a custom development build; Expo Go alone cannot run the casting transport.

Keep phone media on a direct local-device transport; do not require an entire long video to reach the TV before starting. On Android, native media pickers may return temporary `content://` access that can expire before a delayed transfer. Stage those URIs in the app's temporary cache immediately after selection, then remove the copies at selection/session boundaries. Keep media out of signaling and server storage.

**Why:** The user explicitly chose native iOS and Android with a separate build path while retaining direct phone-to-TV privacy. Android's picker URI access can lapse between selection and transfer, causing file-read failures.

**How to apply:** Preserve the native companion and same-Wi-Fi peer-to-peer architecture. Use only app-cache staging for temporary Android picker copies; never upload them, and clean them at selection/session boundaries. Do not claim Expo Go or physical-device compatibility until tested with custom builds on both platforms.

For the phone website, do not clear a populated file input while its selected files are still needed. Browser provider-backed files can become unreadable even though their filename and size remain available.

**Why:** The user repeatedly encountered Android file-permission read failures, which must not be reported as Wi-Fi or video-codec failures. A bounded in-memory snapshot of small selections reduces dependence on provider grants without saving media; loading a whole long film into RAM would be unsafe.

**How to apply:** Keep valid picker selections alive, check file readability before negotiation, and discard unusable references with an explicit reselect action. Keep any browser snapshot temporary and bounded across the entire queue, never persisted or uploaded.

The user wants at least a one-minute recovery grace period when switching away from the phone app or browser, instead of treating a roughly five-second interruption as a lost connection.

**Why:** Briefly viewing something else on the phone should not discard the pairing or immediately report failure.

**How to apply:** Preserve the room and selected media during transient interruptions, cancel pending failure timers on recovery or deliberate disconnect, and let the phone-hosted TV player retry temporary network failures. Be clear that mobile operating systems can suspend background networking; a grace period is not a guarantee of uninterrupted background playback.
