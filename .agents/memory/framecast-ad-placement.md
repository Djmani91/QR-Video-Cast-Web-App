---
name: FrameCast ad placement
description: The agreed automatic advertising behavior for FrameCast mobile.
---

The user selected the existing after-pairing interstitial plus an Android banner on the casting screen and capped interstitials at queued-video breaks. Current pacing is at least two completed videos and five minutes between interstitial attempts. The user also approved an Android native ad in the phone's selected-video preview card. Never stop or interrupt an in-progress TV video for an ad. Ads must not receive users’ media.

**Why:** The user rejected a five-minute casting limit because it would stop long videos, then chose banner plus between-video ads as the additional placement. They later chose to place a native ad inside the selected-video preview instead of adding another full-screen interruption.

**How to apply:** Keep full-screen ads at genuine video boundaries, not on a timer during playback. The native ad replaces only the phone preview while loaded; clearly label it as an ad and retain the selected-video preview when no ad is available. AdMob native inventory may be video, image, or no-fill, so never promise a video ad every time. Use a dedicated Native ad unit, keep requests consent-gated, and keep this placement Android-only unless the user approves iOS. The Android banner uses AdMob's banner unit and appears only when consent allows ad requests. Review current AdMob policy before changing frequency: https://support.google.com/admob/answer/6201362?hl=en

The user chose separate rewarded gates for photos, videos, and screen mirroring. One photo and one video are each free; a completed, user-accepted rewarded ad unlocks up to 20 of that media type for the current TV session. A separate completed rewarded ad unlocks screen mirroring for that TV session; it does not impose a playback timer.

**Why:** The user clarified that photos, videos, and mirroring are distinct behaviors, then selected the same one-free-to-20 rule for photos and videos and a separate optional rewarded ad for mirroring.

**How to apply:** Track photo and video unlocks independently. Reset all three unlocks when the user disconnects or joins a new TV room. Photo and video unlocks require AdMob's earned-reward event. Closing early, declining consent, or an ad error must not unlock them. For Android mirroring only, a confirmed AdMob load-phase no-fill may unlock mirroring for the current TV session; closing early or other ad failures must not. Before every rewarded ad, clearly state the action and reward and get an explicit opt-in; generic feature buttons must not launch the ad without that confirmation.

The user wants Android advertising to use AdMob only and does not want Appodeal.

**Why:** The user explicitly said Appodeal is not needed and AdMob is enough.

**How to apply:** Do not add Appodeal or another ad network unless the user asks again. Preserve the existing AdMob placements and consent handling.
