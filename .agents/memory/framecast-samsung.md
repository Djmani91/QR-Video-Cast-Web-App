---
name: FrameCast Samsung TV target
description: The user's preferred approach for Samsung TV support in FrameCast.
---

For Samsung TVs, target the built-in TV browser using the existing web app; do not build a native Tizen app unless requested.

**Why:** The user briefly requested a native TV player because videos failed, then demonstrated Web Video Caster working in the Samsung browser and asked for that same experience without a separate Samsung app.

**How to apply:** Keep the Samsung browser receiver and native phone companion. Prioritize playback that starts before a full video transfer; verify the real TV before claiming compatibility.

The desired fullscreen behavior is video-only fullscreen: the browser starts in its normal view, playing a video fills the TV screen, and Back returns to the normal browser view.

The user previously confirmed video fullscreen on their Samsung TV; the model was not supplied. Only use a native-video fullscreen path when source support is explicitly confirmed. Otherwise use container fullscreen for videos and photos.

**Why:** The user then showed sideways video despite working fullscreen. A TV's native media overlay can bypass CSS transforms, and fragmented-video rotation metadata is not handled consistently across TV players. Genuine portrait footage must not be stretched to landscape.

**How to apply:** Keep source rotation separate from encoded dimensions and avoid applying it twice. Desktop CSS-transform checks are not proof of Samsung compatibility. Prefer correcting local browser video on the phone and sending already-upright frames to the TV's inline WebRTC player. Do not switch the TV into a canvas or CSS rotation path when rotating this stream, and do not claim hardware compatibility until verified on the TV.

Default to Fit whole video. Keep the picture upright and uncropped; any optional Fill TV screen mode must not stretch or rotate people sideways.

**Why:** The user later explicitly changed the requested default to “fit whole video,” not Fill TV screen, including in the native app.

**How to apply:** Treat orientation and aspect-ratio fit as separate controls. Preserve the complete picture by default; explain that filling a wide screen with portrait footage crops it and keep that choice reversible.

Keep the underlying video visible and full-sized when using a canvas overlay. If corrected-picture drawing is unsupported, keep standard video playback running and explain the presentation limitation instead of pausing the decoder.

**Why:** The user reported previously playable video failing after the wide-screen drawing change. Offscreen/tiny video is unsafe for TV decoder compatibility, and failure of a display enhancement must not stop otherwise supported playback.

**How to apply:** Never rely on desktop drawing checks as proof of Samsung playback. Distinguish actual playing, autoplay permission requiring the TV remote, and real decoder errors. Preserve specific TV feedback rather than replacing it with a generic format warning after a short timeout.

The user reports that TV-side Rotate can produce a black picture while audio continues, and cycling rotation restores the uncorrected picture. A drawing API being available or not throwing is not evidence that the TV can display decoded frames through it.

**Why:** Exception-only fallback and desktop rendering checks did not catch the Samsung display failure.

**How to apply:** For phone-browser files, rotate and crop on the phone with a stable outgoing media track, rather than changing the TV video surface. Relay seek/play/pause/Rotate/Fill commands to the phone's source file; the receiving live video's clock is not the file timeline. Keep phone preview mute separate from TV audio. Confirm decoded video dimensions before reporting TV playback.

Do not treat a fullscreen API call returning without an exception as proof that fullscreen was entered. Some native file-player APIs can silently do nothing for a WebRTC stream.

**Why:** The user reports browser chrome still visible after live-video changes, and later confirms Samsung automatic video fullscreen previously worked but regressed. Samsung's native media entry and general browser fullscreen are not interchangeable.

**How to apply:** Never probe native movie-player fullscreen for WebRTC streams. An exposed legacy method is not proof of source support: it can open the Samsung system “This function is not supported” dialog rather than reject in JavaScript. Keep video inline and use container fullscreen unless native source support is affirmative. Keep a separate TV fullscreen permission button visible outside the five-second controls timeout. Report actual TV state to the phone and explain when a TV-remote gesture or browser menu is required. A phone click cannot transfer browser user activation to the TV, and desktop checks cannot prove physical Samsung compatibility.

Known orientation for a normalized stream must remain authoritative even while the video element reports zero dimensions.

**Why:** Loading and fullscreen transitions can temporarily clear intrinsic dimensions. Treating that as zero rotation can re-enable the TV's native overlay and bypass the intended correction, even when the original file's rotation metadata is correct.

**How to apply:** Clear known rotation only when changing media, not when dimensions temporarily disappear. Check renderer compatibility before sending videos: a TV room can remain open across a publish, so a freshly loaded phone must not silently assume the TV has refreshed too.

**Why:** The user explicitly described this behavior in their Web Video Caster recording and wants FrameCast to behave similarly.

**How to apply:** Distinguish video-player fullscreen from making the entire browser page fullscreen. Explain browser permission limits and verify remote Back behavior rather than assuming either works.

After a phone pairs, the user wants the TV to switch to a full-viewport cinema standby screen and remain there until disconnect. Keep this separate from the active video player's native fullscreen behavior.

**Why:** The user specifically asked for a persistent, animated movie-theater standby screen on the Samsung TV after pairing, with popcorn and cinema imagery.

**How to apply:** Make the page fill the TV viewport whether or not browser fullscreen is granted. Try document fullscreen once per paired room, but keep a clearly visible remote-selectable Full screen button because Samsung may block automatic fullscreen. Do not replace or disrupt the existing active-media fullscreen path.

When a playlist video ends, keep the TV on its full-screen player while the next video loads; do not flash the pairing QR or return to the main page between tracks.

**Why:** The user explicitly requested a steady full-screen handoff with a brief loading state instead of the player shrinking and the TV showing its pairing screen.

**How to apply:** Notify the TV before switching the phone connection, preserve the immersive TV layout through the next-video transfer, and clear the loading state when playback starts. Validate on the real Samsung TV.

Do not diagnose Samsung's “This function is not supported” dialog as a fullscreen failure from the wording alone. Fullscreen capability does not establish video-decoder compatibility, and MP4 is a container, not a codec.

**Why:** The user's supplied phone footage includes HEVC/H.265 inside MP4. Repeated fullscreen changes did not resolve the reported playback failure. Repackaging that video does not turn it into H.264.

**How to apply:** Inspect the actual source codec and distinguish decoding, transport, and fullscreen failures. A compatible H.264 rendition of the same content is a useful hardware control before another speculative APK; do not claim HEVC incompatibility on this TV is conclusively proven without that comparison.

Samsung TV discovery only confirms that the device is present. Open its built-in browser by sending `ms.channel.emit` with `event: ed.apps.launch`, `to: host`, and `data` containing `appId: org.tizen.browser`, `action_type: NATIVE_LAUNCH`, and the target URL in `metaTag`. If remote text entry is needed, Samsung expects `SendInputString` with the text Base64-encoded in `Cmd` and `DataOfCmd: base64`; ordinary key presses do not substitute for that payload.

**Why:** FrameCast 1.1.14 found the TV and established a WebSocket connection but its `KEY_BROWSER`/Ctrl+L sequence and plain-text input command did not open the browser. The maintained Samsung WebSocket implementation launches the browser through `ed.apps.launch`; its text-input command uses Base64 encoding.

**How to apply:** Treat discovery, remote-control connection, and browser navigation as separate success steps. Use the browser-app launch event with the room URL, and do not report success based only on SSDP discovery, a WebSocket handshake, or sending the request; verify browser opening on the actual TV.
