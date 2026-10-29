---
name: FrameCast ad placement
description: The agreed automatic advertising behavior for FrameCast mobile.
---

The user selected the existing after-pairing interstitial plus an Android banner on the casting screen and capped interstitials at queued-video breaks. Current pacing is at least two completed videos and five minutes between interstitial attempts. The user also approved an Android native ad in the phone's selected-video preview card. Never stop or interrupt an in-progress TV video for an ad. Ads must not receive users’ media.

**Why:** The user rejected a five-minute casting limit because it would stop long videos, then chose banner plus between-video ads as the additional placement. They later chose to place a native ad inside the selected-video preview instead of adding another full-screen interruption.

**How to apply:** Keep full-screen ads at genuine video boundaries, not on a timer during playback. The native ad replaces only the phone preview while loaded; clearly label it as an ad and retain the selected-video preview when no ad is available. AdMob native inventory may be video, image, or no-fill, so never promise a video ad every time. Use a dedicated Native ad unit, keep requests consent-gated, and keep this placement Android-only unless the user approves iOS. The Android banner uses a separate production ad unit and appears only when consent allows ad requests. Review current AdMob policy before changing frequency: https://support.google.com/admob/answer/6201362?hl=en
