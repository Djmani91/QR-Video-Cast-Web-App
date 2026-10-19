---
name: FrameCast Samsung TV target
description: The user's preferred approach for Samsung TV support in FrameCast.
---

For Samsung TVs, target the built-in TV browser using the existing web app; do not build a native Tizen app unless requested.

**Why:** The user briefly requested a native TV player because videos failed, then demonstrated Web Video Caster working in the Samsung browser and asked for that same experience without a separate Samsung app.

**How to apply:** Keep the Samsung browser receiver and native phone companion. Prioritize playback that starts before a full video transfer; verify the real TV before claiming compatibility.

The desired fullscreen behavior is video-only fullscreen: the browser starts in its normal view, playing a video fills the TV screen, and Back returns to the normal browser view.

**Why:** The user explicitly described this behavior in their Web Video Caster recording and wants FrameCast to behave similarly.

**How to apply:** Distinguish video-player fullscreen from making the entire browser page fullscreen. Explain browser permission limits and verify remote Back behavior rather than assuming either works.
