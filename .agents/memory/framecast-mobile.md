---
name: FrameCast native companion
description: The selected iOS and Android companion-app direction and its native WebRTC build constraint.
---

FrameCast's phone companion should be a true native iOS/Android app with QR scanning, five-digit room entry, and native photo/video selection. The user chose this over a browser wrapper. Native WebRTC requires a custom development build; Expo Go alone cannot run the casting transport.

Keep phone media on a direct local-device transport; do not require an entire long video to reach the TV before starting. On Android, native media pickers may return temporary `content://` access that can expire before a delayed transfer. Stage those URIs in the app's temporary cache immediately after selection, then remove the copies at selection/session boundaries. Keep media out of signaling and server storage.

**Why:** The user explicitly chose native iOS and Android with a separate build path while retaining direct phone-to-TV privacy. Android's picker URI access can lapse between selection and transfer, causing file-read failures.

**How to apply:** Preserve the native companion and same-Wi-Fi peer-to-peer architecture. Use only app-cache staging for temporary Android picker copies; never upload them, and clean them at selection/session boundaries. Do not claim Expo Go or physical-device compatibility until tested with custom builds on both platforms.

For the phone website, do not clear a populated file input while its selected files are still needed. Browser provider-backed files can become unreadable even though their filename and size remain available.

**Why:** The user repeatedly encountered Android file-permission read failures, which must not be reported as Wi-Fi or video-codec failures. Bounded snapshots help photo transfers, but copying even a short video or probing its tail can force a provider to retrieve the whole file before streaming starts.

**How to apply:** Keep valid picker selections alive. For browser live video, let the media element read the original Blob on demand: do not take an eager whole-file snapshot or run redundant head/tail probes. Confirm an actual decoded phone frame with a bounded startup wait; surface decoder, autoplay, and cloud-only file problems separately. For photo transfers, keep readability checks and any temporary snapshots bounded across the whole queue. Discard unusable references with an explicit reselect action, never persist or upload media.

For EAS builds, the FrameCast mobile project needs its actual Expo owner/project link; a running Expo preview or the workspace's local Expo identity does not prove that an EAS project is linked. Do not guess the owner from the GitHub URL or create a project under Replit's local account.

**Why:** The local Expo CLI authenticated as a Replit-private account, while the mobile app configuration has no EAS project ID and Expo could not find a FrameCast project under the checked names.

**How to apply:** Inspect the app's `owner` and `extra.eas.projectId`, then verify with the Expo build service. If they are absent or the project cannot be found, request the exact Expo project URL before building.

The user wants returning to the same phone browser to reconnect to the same TV automatically, without refreshing, re-entering the code, or rescanning. Keep pairing and selected media until the user explicitly disconnects; a one-minute transport grace window is not a pairing timeout.

**Why:** The user reports that briefly leaving the browser made later video sends fail and required repeated TV refreshes and QR scanning.

**How to apply:** Separate pairing intent from an individual WebRTC peer. Probe the existing transport on return and recreate it automatically in the same room when stale. Preserve selected files and playback state in the live page; suppress overlapping repairs and ignore replies/candidates/closes from replaced sessions. An explicit Disconnect or TV room replacement must cancel recovery. Be clear that the OS can suspend playback/networking, closing the tab loses in-memory files, and server restarts or a genuinely expired room cannot be repaired from browser state alone.

Deliver an installable Android APK for testing first; the user will request iOS after testing Android. They also want opt-in background casting that keeps the connection when the app is backgrounded, with playback controls accessible outside the app.

**Why:** The user explicitly requested Android first and described Web Video Caster's background permission and external playback controls as the desired experience.

**How to apply:** Prioritize Android and leave iOS unchanged until requested. Background casting needs real Android foreground-service/media-notification support, not just a permission popup or a browser wake lock. Do not imply an Expo preview is an APK, or promise continued casting after force-stop, network loss, or OS termination.
