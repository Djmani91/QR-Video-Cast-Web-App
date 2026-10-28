---
name: FrameCast ad placement
description: The agreed automatic advertising behavior for FrameCast mobile.
---

Show one automatic interstitial after each successful TV pairing. This is not a rewarded ad and grants no extra casting time. Do not repeat ads on a short timer or interrupt ongoing playback. Interstitials may be video or static; AdMob decides the creative. Continue to handle required privacy consent and keep phone media off the ads SDK.

**Why:** The user selected one automatic after-pairing ad instead of an opt-in rewarded video.

**How to apply:** Trigger at most once per pairing, after the app reaches the connected screen. If the ad is unavailable, let casting continue. A fresh pairing after reopening may show another ad.
