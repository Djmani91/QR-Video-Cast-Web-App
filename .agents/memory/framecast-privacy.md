---
name: FrameCast privacy requirement
description: The user's non-persistent, peer-to-peer video privacy requirement for FrameCast.
---

FrameCast must not persist user data or video. Media travels directly from the phone to the TV. Pairing signals stay only in process memory and expire after 4 hours without activity; active devices extend the room by polling. Avoid logging room identifiers.
The direct-only version requires the phone and TV to be on the same local Wi-Fi network; do not enable a media relay without changing this product decision.
Both browser and native phone senders should transfer selected media in WebRTC data-channel chunks; do not depend on `HTMLVideoElement.captureStream`, which is unavailable in iPhone Safari. The TV may keep a photo batch in memory for in-session browsing, but must clear it when the session ends and never upload or persist it.

**Why:** The user requires direct, non-persistent media transfer for privacy in the UK and other countries, confirmed both devices should use the same Wi-Fi, and asked for pairing to last through 3–4 hours of activity.

**How to apply:** Keep media out of the API and persistent storage. Treat the 4-hour limit as inactivity expiry, not a guarantee against Wi-Fi loss, browser suspension, or server restarts. Release TV-side in-memory chunks/object URLs on disconnect, new room, or page close; explain same-Wi-Fi requirements, and do not present the design as a legal-compliance certification.
