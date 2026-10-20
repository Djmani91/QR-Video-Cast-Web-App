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

The user has no other Expo setup beyond Replit's mobile preview. Do not keep asking them for an existing Expo build-project link. A running preview is not an EAS build-project link.

**Why:** The user explicitly clarified, repeatedly, that this preview is the only Expo setup they have. The local CLI identity is a Replit-private account, not evidence of a personal EAS project.

**How to apply:** Work from the existing app source. Android Gradle builds can run without an EAS account; investigate that path rather than requiring a nonexistent project URL. If choosing EAS, treat creating/linking a project under the user's intended account as new setup; do not guess the owner from GitHub or create a project under Replit's local account.

Keep the Android build source in a private GitHub repository. The user approved making their provided repository private before uploading app source.

**Why:** The user selected private source hosting for the APK build.

**How to apply:** Confirm repository visibility is private before pushing a clean, allowlisted source export. Exclude phone media, secrets, chat files, and existing project history.

Preserve a populated default branch when uploading a clean Android source export; use an isolated build branch rather than force-pushing unrelated export history over existing work.

**Why:** The repository gained existing project files while the clean source was being prepared, so the initially empty repository could no longer safely accept that export as its default branch.

**How to apply:** Recheck remote refs before uploading. Build the allowlisted source separately and leave the existing default branch untouched unless the user explicitly approves integration or replacement.

Verify authenticated repository access before promising GitHub changes; the source-control connection's active/healthy status alone is not proof of usable workspace credentials.

**Why:** Connection attachment reported success, but authenticated GitHub CLI access was unavailable and the automatic authorization prompts failed. A user reconnect did not fix the CLI; GitHub's official CLI browser sign-in did authorize repository administration.

**How to apply:** Try an authenticated read before remote writes. After one reconnect and retry, stop asking for repeated integration reconnects. Use GitHub CLI's official browser/device approval as an alternate authorization path; never request a raw token in chat. Confirm the intended account and private repository visibility before pushing.

Keep CLI login configuration in an ignored, non-temporary location outside the clean source export, and have the upload ready before asking for browser approval.

**Why:** Temporary CLI login files disappeared during Android build preparation, requiring another approval even though the repository had already been made private.

**How to apply:** Do not keep build authentication in `/tmp`. Let the CLI manage credentials without reading them, exclude its configuration from source/deployment exports, and start the guarded upload directly after successful authorization.

Current Google SDK repositories no longer provide the legacy Android package named `tools`; do not rely on an Android setup action's default package list including it.

**Why:** The upstream package retirement prevents SDK setup before any app compilation, even when command-line tools themselves install successfully.

**How to apply:** Use supported command-line/platform tools and explicitly install the platform, build tools, NDK, and CMake required by the app.

The user wants returning to the same phone browser to reconnect to the same TV automatically, without refreshing, re-entering the code, or rescanning. Keep pairing and selected media until the user explicitly disconnects; a one-minute transport grace window is not a pairing timeout.

**Why:** The user reports that briefly leaving the browser made later video sends fail and required repeated TV refreshes and QR scanning.

**How to apply:** Separate pairing intent from an individual WebRTC peer. Probe the existing transport on return and recreate it automatically in the same room when stale. Preserve selected files and playback state in the live page; suppress overlapping repairs and ignore replies/candidates/closes from replaced sessions. An explicit Disconnect or TV room replacement must cancel recovery. Be clear that the OS can suspend playback/networking, closing the tab loses in-memory files, and server restarts or a genuinely expired room cannot be repaired from browser state alone.

Deliver an installable Android APK for testing first; the user will request iOS after testing Android. They also want opt-in background casting that keeps the connection when the app is backgrounded, with playback controls accessible outside the app.

**Why:** The user explicitly requested Android first and described Web Video Caster's background permission and external playback controls as the desired experience.

**How to apply:** Prioritize Android and leave iOS unchanged until requested. Background casting needs real Android foreground-service/media-notification support, not just a permission popup or a browser wake lock. Do not imply an Expo preview is an APK, or promise continued casting after force-stop, network loss, or OS termination.
