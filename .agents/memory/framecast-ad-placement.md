---
name: FrameCast ad placement
description: The agreed automatic advertising behavior for FrameCast mobile.
---

The user selected the existing after-pairing interstitial plus an Android banner on the casting screen and capped interstitials at queued-video breaks. Current pacing is at least two completed videos and five minutes between interstitial attempts. The user also approved an Android native ad in the phone's selected-video preview card. Never stop or interrupt an in-progress TV video for an ad. Ads must not receive users’ media.

**Why:** The user rejected a five-minute casting limit because it would stop long videos, then chose banner plus between-video ads as the additional placement. They later chose to place a native ad inside the selected-video preview instead of adding another full-screen interruption.

**How to apply:** Keep full-screen ads at genuine video boundaries, not on a timer during playback. The native ad replaces only the phone preview while loaded; clearly label it as an ad and retain the selected-video preview when no ad is available. AdMob native inventory may be video, image, or no-fill, so never promise a video ad every time. Use a dedicated Native ad unit, keep requests consent-gated, and keep this placement Android-only unless the user approves iOS. The Android banner uses AdMob's banner unit and appears only when consent allows ad requests. Review current AdMob policy before changing frequency: https://support.google.com/admob/answer/6201362?hl=en

The user chose separate rewarded gates for photos and videos. One photo and one video are each free per TV session. One completed, user-accepted rewarded ad unlocks exactly one additional item of that media type; Premium is required for further items, up to 20. The user later made background casting Premium-only; because mirroring other apps requires FrameCast to run in the background, screen mirroring is Premium-only and no longer uses rewarded time extensions.

**Why:** The user first chose one free mirroring minute and one additional rewarded minute, then explicitly required Premium for background use. Since external-app mirroring requires background use, the later Premium-only rule supersedes the earlier mirror reward.

**How to apply:** Track photo and video item allowances independently and reset them on disconnect or a new TV room. Require Premium for screen mirroring and for keeping any cast active while FrameCast is backgrounded; otherwise stop the media, preserve pairing, and explain the Premium benefit when the user returns. A completed rewarded ad unlocks one additional item. If the user voluntarily requests the ad but inventory is unavailable or the provider fails before showing it, grant that same single extra item as an app courtesy, not a fabricated ad reward. Closing a displayed ad early, declining consent, or cancelling does not unlock media.

**Why for the no-ad exception:** The user explicitly requires that an AdMob high-floor/no-fill or other unavailable-ad response must not block a customer who tried to watch. This exception does not remove the existing two-item free-session cap or unlock Premium/background features.

The user wants Android advertising to use AdMob only and does not want Appodeal.

**Why:** The user explicitly said Appodeal is not needed and AdMob is enough.

**How to apply:** Do not add Appodeal or another ad network unless the user asks again. Preserve the existing AdMob placements and consent handling.
