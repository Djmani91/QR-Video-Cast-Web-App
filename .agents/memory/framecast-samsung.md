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

**How to apply:** Keep source rotation separate from encoded dimensions and avoid applying it twice. When correcting orientation in the receiver, use a fullscreen playback container that retains the transform and upright controls. Retain a manual Rotate fallback for missing metadata. Do not claim the photo or orientation correction is confirmed on hardware until the user verifies it.

Known orientation for a normalized stream must remain authoritative even while the video element reports zero dimensions.

**Why:** Loading and fullscreen transitions can temporarily clear intrinsic dimensions. Treating that as zero rotation can re-enable the TV's native overlay and bypass the intended correction, even when the original file's rotation metadata is correct.

**How to apply:** Clear known rotation only when changing media, not when dimensions temporarily disappear. Check renderer compatibility before sending videos: a TV room can remain open across a publish, so a freshly loaded phone must not silently assume the TV has refreshed too.

**Why:** The user explicitly described this behavior in their Web Video Caster recording and wants FrameCast to behave similarly.

**How to apply:** Distinguish video-player fullscreen from making the entire browser page fullscreen. Explain browser permission limits and verify remote Back behavior rather than assuming either works.
