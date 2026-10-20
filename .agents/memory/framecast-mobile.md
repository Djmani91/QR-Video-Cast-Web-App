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

On native Expo, `File.slice()` creates a Blob from a typed array, which React Native's BlobManager rejects with “Creating blobs from 'ArrayBuffer' and 'ArrayBufferView' are not supported.” Stream native files with `File.open(FileMode.ReadOnly)` and `FileHandle.readBytes()` instead; close handles in `finally`. Keep `slice().arrayBuffer()` only for the web path.

**Why:** The native Blob limitation surfaced as a send failure while the phone was transferring queued photos and videos.

**How to apply:** Avoid Expo `File.slice()` in native chunk loops and MP4 preparation; use a sequential file handle so large media stays chunked in memory.

The user has no other Expo setup beyond Replit's mobile preview. Do not keep asking them for an existing Expo build-project link. A running preview is not an EAS build-project link.

**Why:** The user explicitly clarified, repeatedly, that this preview is the only Expo setup they have. The local CLI identity is a Replit-private account, not evidence of a personal EAS project.

**How to apply:** Work from the existing app source. Android Gradle builds can run without an EAS account; investigate that path rather than requiring a nonexistent project URL. If choosing EAS, treat creating/linking a project under the user's intended account as new setup; do not guess the owner from GitHub or create a project under Replit's local account.

Keep the Android build source in a private GitHub repository. The user approved making their provided repository private before uploading app source.

**Why:** The user selected private source hosting for the APK build.

**How to apply:** Confirm repository visibility is private before pushing a clean, allowlisted source export. Exclude phone media, secrets, chat files, and existing project history.

Preserve a populated default branch when uploading a clean Android source export; use an isolated build branch rather than force-pushing unrelated export history over existing work.

**Why:** The repository gained existing project files while the clean source was being prepared, so the initially empty repository could no longer safely accept that export as its default branch.

**How to apply:** Recheck remote refs before uploading. Build the allowlisted source separately and leave the existing default branch untouched unless the user explicitly approves integration or replacement. Before each later APK build, refresh the allowlisted native app sources and any new components from the working app into the separate build checkout. Expo preview edits do not automatically update that copy or an already-running build; state that distinction clearly when previewing newer UI.

Verify authenticated repository access before promising GitHub changes; the source-control connection's active/healthy status alone is not proof of usable workspace credentials. When the GitHub CLI uses a non-default config directory, raw Git HTTPS pushes need the Git credential helper registered from that same CLI config.

**Why:** Connection attachment reported success, but authenticated GitHub CLI access was unavailable and the automatic authorization prompts failed. A user reconnect did not fix the CLI; GitHub's official CLI browser sign-in did authorize repository administration. In this workspace, `gh api` succeeded but Git's HTTPS push still failed until the CLI credential helper was set up.

**How to apply:** Try an authenticated read before remote writes. After one reconnect and retry, stop asking for repeated integration reconnects. Use GitHub CLI's official browser/device approval as an alternate authorization path; never request a raw token in chat. For a non-default config, export `GH_CONFIG_DIR` for `gh auth setup-git --hostname github.com` and the Git push. Confirm the intended account and private repository visibility before pushing.

Keep CLI login configuration in an ignored, non-temporary location outside the clean source export, and have the upload ready before asking for browser approval.

**Why:** Temporary CLI login files disappeared during Android build preparation, requiring another approval even though the repository had already been made private.

**How to apply:** Do not keep build authentication in `/tmp`. Let the CLI manage credentials without reading them, exclude its configuration from source/deployment exports, and start the guarded upload directly after successful authorization.

Current Google SDK repositories no longer provide the legacy Android package named `tools`; do not rely on an Android setup action's default package list including it.

**Why:** The upstream package retirement prevents SDK setup before any app compilation, even when command-line tools themselves install successfully.

**How to apply:** Use supported command-line/platform tools and explicitly install the platform, build tools, NDK, and CMake required by the app.

The user wants returning to the same phone browser to reconnect to the same TV automatically, without refreshing, re-entering the code, or rescanning. Keep pairing and selected media until the user explicitly disconnects; a one-minute transport grace window is not a pairing timeout.

**Why:** The user reports that briefly leaving the browser made later video sends fail and required repeated TV refreshes and QR scanning.

**How to apply:** Separate pairing intent from an individual WebRTC peer. Probe the existing transport on return and recreate it automatically in the same room when stale. Preserve selected files and playback state in the live page; suppress overlapping repairs and ignore replies/candidates/closes from replaced sessions. An explicit Disconnect or TV room replacement must cancel recovery. Be clear that the OS can suspend playback/networking, closing the tab loses in-memory files, and server restarts or a genuinely expired room cannot be repaired from browser state alone.

Keep the phone's first screen connection-first: a concise TV browser instruction, QR scan, and code entry instead of a large marketing hero. Background casting is a saved one-time Android preference: ask once, then start automatically on later pairings while enabled; Disconnect stops only the current session.

**Why:** The user clarified that customers should opt in once rather than enable background casting on every session, while keeping the TV connected when switching apps.

**How to apply:** Persist the preference on the phone and expose it in Settings. On the first pairing show Enable/Not now once; if enabled, auto-start the Android foreground service for each room. Disconnect stops the service but preserves the preference. Keep the OS permission prompt and notification visible; do not promise casting after force-stop, network loss, or OS termination.

Use neutral video-link wording, not YouTube-specific branding, in the mobile app's URL section.

**Why:** The user requested different wording because they are concerned about Google Play review.

**How to apply:** Keep titles, example addresses and instructional copy generic. Preserve supported official playback behavior and honest compatibility limitations; changing the wording is not a guarantee of store approval.

Android screen mirroring should include supported app/system playback audio as well as the screen image; never substitute microphone audio. Audio remains ephemeral and travels directly to the TV over the peer connection. Some source apps can block playback capture.

**Why:** The user confirmed that screen mirroring should send phone media audio to the TV and approved playback capture, not microphone recording.

**How to apply:** Use Android's playback-capture API with MediaProjection consent and RECORD_AUDIO permission, but never a microphone source. Explain Android/source-app limits and do not claim the native path works until tested on a physical device.

Expo SDK 57's Android activity-result launcher can become unregistered after Android recreates the Activity while keeping the app process alive. Keep the upstream relaunch recovery in Expo Modules Core until the installed SDK version includes it.

**Why:** Without recovery, native image/file pickers reject with an unregistered ActivityResultLauncher error after Activity recreation.

**How to apply:** Check the installed Expo Modules Core source or changelog before removing the local backport. Keep the patch scoped to activity-result re-registration.

Standalone Android APK bundles must set `EXPO_PUBLIC_DOMAIN` to the verified published FrameCast host; otherwise native API calls remain relative and phone-to-TV signaling fails.

**Why:** React Native cannot resolve the web app's relative `/api` routes without a base URL.

**How to apply:** Set the production host in the Gradle build environment and verify the final JS bundle contains it before sharing an APK.

For Android test builds, provide a direct download URL rather than only a Replit asset/library card; the user reports those cards do not work for them. Verify the endpoint before sharing it.

**Why:** The user has repeatedly asked for a clickable direct APK download after card-based downloads failed.

**How to apply:** Use the FrameCast API download route for the current APK and confirm it returns the APK content (including a ranged request) before sending the URL.
