---
name: FrameCast subscriptions
description: Android Google Play trial, monthly renewal, and ad-supported access choices.
---

The user chose an Android choice between a 3-day Google Play free trial and continuing with the ad-supported app after the first successful TV pairing, not at app launch. The subscription renews monthly at USD $3.99 after the trial. Display the actual Google Play/RevenueCat localized price; the US storefront should show USD $3.99.

The production Google Play product ID is `framecast_monthly` with base plan `monthly`. RevenueCat uses `framecast_monthly:monthly` in the current `default` offering's `$rc_monthly` package, attached to the `premium` entitlement. The older `framecast_premium:monthly` product is not in the current package but remains attached to the entitlement; preserve it unless historical purchases are ruled out.

**Why:** The user selected a three-day trial, monthly billing, and USD 3.99, then asked to move the choice from app launch to the first TV connection and remove the startup tutorial.

**How to apply:** Keep this offer Android-only until the user asks for iOS billing. Keep the current RevenueCat package mapped to the exact Google Play product and base plan above. Show the first offer after successful TV pairing, not at app launch. Do not promise a trial unless Google Play reports the configured offer; always show the localized renewal price and cancellation terms. Premium removes ad limits and allows background casting; free casting stops when FrameCast leaves the foreground. Background casting is an explicit Premium setting and requires Android's ongoing casting notification.

The user chose a single 30-minute ad-supported full-access casting period instead of one-item/rewarded-ad limits. It covers up to 20 photos or videos per TV session and foreground screen mirroring; background casting remains Premium-only. Count time only while a TV is connected and FrameCast is foregrounded. Disconnecting or backgrounding pauses the remaining time; reconnecting does not reset it. Show the Premium gate when time expires, while keeping existing banner/pairing/video-break ads non-blocking.

**Why:** The user said AdMob no-fill must never strand a free customer who was trying to watch a rewarded ad, and chose a one-time 30-minute period rather than resetting it after each connection.

**How to apply:** Without FrameCast sign-in, the one-use marker can only be enforced locally per installation; reinstalling or clearing app data can reset it. Keep this marker non-identifying and device-local. Do not add server-side customer tracking without revisiting the privacy decision.

Before changing app entitlement code to troubleshoot a completed Play purchase, verify RevenueCat's Play Store service-account connection as well as the product and entitlement mappings. The app record exposes `play_service_account_credentials_configured`; require it to be true.

**Why:** A valid product and entitlement mapping still cannot grant Premium or acknowledge a Google Play transaction if RevenueCat cannot verify purchases with Google Play.

**How to apply:** Read the boolean `play_service_account_credentials_configured` from the RevenueCat app record for the Android app; if false, have the owner configure the Google Play service-account JSON directly in RevenueCat. Never ask the user to paste credentials into chat. A product's existence or price does not prove Play purchase verification is configured.

Google Play purchases can be completed outside FrameCast, leaving RevenueCat customer info cached until the app resumes. Refresh customer info on foreground before requesting ads, and hide stale ad errors once Premium is confirmed.

**Why:** A pairing-ad no-fill notice appeared for a reported-active subscriber; the notice came from AdMob, while the app's eligibility decision depended on the last cached entitlement.

**How to apply:** Treat ad availability and subscription status as separate signals. Pause ad requests during entitlement refresh, then suppress every ad placement and its stale errors when the `premium` entitlement is active.
