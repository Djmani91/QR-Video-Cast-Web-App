---
name: FrameCast ad placement
description: The agreed automatic advertising behavior for FrameCast mobile.
---

The user selected the existing after-pairing interstitial plus an Android banner on the casting screen and capped interstitials at queued-video breaks. Current pacing is at least two completed videos and five minutes between interstitial attempts. The user also approved an Android native ad in the phone's selected-video preview card. Never stop or interrupt an in-progress TV video for an ad. Ads must not receive users’ media.

**Why:** The user rejected a five-minute casting limit because it would stop long videos, then chose banner plus between-video ads as the additional placement. They later chose to place a native ad inside the selected-video preview instead of adding another full-screen interruption.

**How to apply:** Keep full-screen ads at genuine video boundaries, not on a timer during playback. The native ad replaces only the phone preview while loaded; clearly label it as an ad and retain the selected-video preview when no ad is available. AdMob native inventory may be video, image, or no-fill, so never promise a video ad every time. Use a dedicated Native ad unit, keep requests consent-gated, and keep this placement Android-only unless the user approves iOS. The Android banner uses AdMob's banner unit and appears only when consent allows ad requests. Review current AdMob policy before changing frequency: https://support.google.com/admob/answer/6201362?hl=en

The user chose separate rewarded gates for photos, videos, and screen mirroring. One photo and one video are each free per TV session. One completed, user-accepted rewarded ad unlocks exactly one additional item of that media type; Premium is required for further items, up to 20. Android screen mirroring gets one free minute, then pauses and offers either a rewarded ad for one more minute or Premium for unlimited mirroring. A confirmed rewarded-ad no-fill still unlocks mirroring for the current TV session, as previously approved.

**Why:** The user clarified that photos, videos, and mirroring are distinct behaviors, then changed the original one-free-to-20 media reward to one extra item followed by Premium. They chose one free mirroring minute and one additional minute per rewarded ad, with both ad and Premium options shown at the limit.

**How to apply:** Track photo and video item allowances independently and reset them on disconnect or a new TV room. Start the mirror timer only after the TV connection is active; stop sending screen frames at each one-minute boundary, then offer an explicitly opted-in rewarded ad for one more minute or Premium. If the app is backgrounded at the limit, show the prompt when FrameCast returns to the foreground. Completed ads alone grant the extra media item or mirror minute; closing early, declining consent, or non-no-fill ad errors grant nothing. Keep the approved mirror no-fill session fallback.

The user wants Android advertising to use AdMob only and does not want Appodeal.

**Why:** The user explicitly said Appodeal is not needed and AdMob is enough.

**How to apply:** Do not add Appodeal or another ad network unless the user asks again. Preserve the existing AdMob placements and consent handling.
