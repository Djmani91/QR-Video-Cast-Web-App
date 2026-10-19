---
name: FrameCast privacy requirement
description: The user's non-persistent, peer-to-peer video privacy requirement for FrameCast.
---

FrameCast must not persist user data or media. Phone-selected media travels directly from the phone to the TV. For URL playback, send only the link peer-to-peer and have the TV fetch media from the original source; FrameCast must not proxy or store that media, and the source site will see the TV's request. Pairing signals stay only in process memory and expire after 4 hours without activity; active devices extend the room by polling. Avoid logging room identifiers.
Use STUN-only connection discovery to improve direct connections; a STUN service sees public IP addresses, but no media is sent to it. Do not configure TURN or another media relay without changing this product decision. The direct-only version still requires network paths that allow device-to-device traffic.
Both browser and native phone senders should transfer selected media in WebRTC data-channel chunks; do not depend on `HTMLVideoElement.captureStream`, which is unavailable in iPhone Safari. The TV may keep a photo batch in memory for in-session browsing, but must clear it when the session ends and never upload or persist it.

**Why:** The user requires non-persistent media transfer for privacy in the UK and other countries, confirmed both devices should use the same Wi-Fi, approved STUN-only discovery while keeping local media direct, and requested video-link playback.

**How to apply:** Keep media out of the API and persistent storage. Use STUN for candidate discovery only; never add TURN implicitly. For linked media, explain that the source serves the TV directly and may apply its own access controls. Treat the 4-hour limit as inactivity expiry, not a guarantee against Wi-Fi loss, browser suspension, or server restarts. Release TV-side in-memory chunks/object URLs on disconnect, new room, or page close; explain same-Wi-Fi requirements, and do not present the design as a legal-compliance certification.
