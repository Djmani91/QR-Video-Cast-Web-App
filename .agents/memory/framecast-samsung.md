---
name: FrameCast Samsung TV target
description: The user's preferred approach for Samsung TV support in FrameCast.
---

For Samsung TVs, target the built-in TV browser using the existing web app; do not build a native Tizen app unless requested.

**Why:** The user briefly requested a native TV player because videos failed, then demonstrated Web Video Caster working in the Samsung browser and asked for that same experience without a separate Samsung app.

**How to apply:** Keep the Samsung browser receiver and native phone companion. Prioritize playback that starts before a full video transfer; verify the real TV before claiming compatibility.

The desired fullscreen behavior is video-only fullscreen: the browser starts in its normal view, playing a video fills the TV screen, and Back returns to the normal browser view.

The user confirmed video fullscreen works on their Samsung TV; the model was not supplied. Preserve that native-video path for ordinary videos. Photos need fullscreen on the gallery container. Videos requiring explicit rotation need container fullscreen instead of the native media overlay.

**Why:** The user then showed sideways video despite working fullscreen. A TV's native media overlay can bypass CSS transforms, and fragmented-video rotation metadata is not handled consistently across TV players. Genuine portrait footage must not be stretched to landscape.

**How to apply:** Keep source rotation separate from encoded dimensions and avoid applying it twice. Desktop CSS-transform checks are not proof of Samsung compatibility. Prefer correcting local browser video on the phone and sending already-upright landscape frames to the TV's ordinary WebRTC video player. Do not switch the TV into a canvas or CSS rotation path when rotating this stream. Retain native fullscreen and do not claim hardware compatibility until verified on the TV.

The user wants videos to show horizontally and fill the TV screen. Default to Fill TV screen, keeping the picture upright and center-cropping portrait footage rather than stretching it or turning people sideways. Offer Fit whole video to restore the complete picture.

**Why:** The user explicitly clarified that a narrow vertical picture is not the desired TV presentation, even when upright.

**How to apply:** Treat orientation and aspect-ratio fill as separate controls. Explain that wide-screen filling of portrait footage crops the top/bottom; preserve the original media and make this display choice reversible.

Keep the underlying video visible and full-sized when using a canvas overlay. If corrected-picture drawing is unsupported, keep standard video playback running and explain the presentation limitation instead of pausing the decoder.

**Why:** The user reported previously playable video failing after the wide-screen drawing change. Offscreen/tiny video is unsafe for TV decoder compatibility, and failure of a display enhancement must not stop otherwise supported playback.

**How to apply:** Never rely on desktop drawing checks as proof of Samsung playback. Distinguish actual playing, autoplay permission requiring the TV remote, and real decoder errors. Preserve specific TV feedback rather than replacing it with a generic format warning after a short timeout.

The user reports that TV-side Rotate can produce a black picture while audio continues, and cycling rotation restores the uncorrected picture. A drawing API being available or not throwing is not evidence that the TV can display decoded frames through it.

**Why:** Exception-only fallback and desktop rendering checks did not catch the Samsung display failure.

**How to apply:** For phone-browser files, rotate and crop on the phone with a stable outgoing media track, rather than changing the TV video surface. Relay seek/play/pause/Rotate/Fill commands to the phone's source file; the receiving live video's clock is not the file timeline. Keep phone preview mute separate from TV audio. Confirm decoded video dimensions before reporting TV playback.

Known orientation for a normalized stream must remain authoritative even while the video element reports zero dimensions.

**Why:** Loading and fullscreen transitions can temporarily clear intrinsic dimensions. Treating that as zero rotation can re-enable the TV's native overlay and bypass the intended correction, even when the original file's rotation metadata is correct.

**How to apply:** Clear known rotation only when changing media, not when dimensions temporarily disappear. Check renderer compatibility before sending videos: a TV room can remain open across a publish, so a freshly loaded phone must not silently assume the TV has refreshed too.

**Why:** The user explicitly described this behavior in their Web Video Caster recording and wants FrameCast to behave similarly.

**How to apply:** Distinguish video-player fullscreen from making the entire browser page fullscreen. Explain browser permission limits and verify remote Back behavior rather than assuming either works.
