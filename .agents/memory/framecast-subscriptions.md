---
name: FrameCast subscriptions
description: Android Google Play trial, monthly renewal, and ad-supported access choices.
---

The user chose an Android first-launch choice between a 3-day Google Play free trial and continuing with the ad-supported app. The subscription renews monthly at USD $3.99 after the trial. Display the actual Google Play/RevenueCat localized price; the US storefront should show USD $3.99.

The production Google Play product ID is `framecast_monthly` with base plan `monthly`. RevenueCat uses `framecast_monthly:monthly` in the current `default` offering's `$rc_monthly` package, attached to the `premium` entitlement. The older `framecast_premium:monthly` product is not in the current package but remains attached to the entitlement; preserve it unless historical purchases are ruled out.

**Why:** The user specifically selected a three-day trial, monthly billing, first-launch-only presentation, and clarified the target price is USD 3.99.

**How to apply:** Keep this offer Android-only until the user asks for iOS billing. Keep the current RevenueCat package mapped to the exact Google Play product and base plan above. Do not advertise or start a free trial unless the store product reports the configured 3-day offer. The current implementation treats active Premium as ad-free, including bypassing rewarded-ad gates; free users keep the agreed ad placements and reward rules.

Before changing app entitlement code to troubleshoot a completed Play purchase, verify RevenueCat's Play Store service-account connection as well as the product and entitlement mappings.

**Why:** A valid product and entitlement mapping still cannot grant Premium if RevenueCat cannot verify purchases with Google Play.

**How to apply:** Check that RevenueCat reports the Play service account configured for the `com.tvcast.com` Android app; never ask the user to paste service-account credentials into chat.
