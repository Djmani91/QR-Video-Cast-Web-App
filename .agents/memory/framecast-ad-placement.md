---
name: FrameCast ad placement
description: The agreed automatic advertising behavior for FrameCast mobile.
---

The current app behavior is one automatic interstitial after each successful TV pairing. The user now wants automatic video ads every five minutes while TV playback continues; do not impose a casting-time cutoff. Do not add timer-triggered full-screen ads without agreeing a compliant placement first: Google says interstitials belong at logical breaks and warns about recurring or unexpected interstitials. Keep media peer-to-peer and out of the ads SDK.

**Why:** The user clarified that a five-minute limit would stop long videos, which is not acceptable; the goal is monetization without interrupting TV playback. Their earlier choice of one after-pairing ad remains the current implementation.

**How to apply:** Keep the existing after-pairing placement unless the user chooses another. Prefer interstitials between completed videos or a non-interruptive phone banner; do not stop casting or surprise users mid-video. If changing ad placement, review current AdMob policy first: https://support.google.com/admob/answer/6201362?hl=en
