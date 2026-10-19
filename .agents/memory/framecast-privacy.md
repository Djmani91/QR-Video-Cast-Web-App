---
name: FrameCast privacy requirement
description: The user's non-persistent, peer-to-peer video privacy requirement for FrameCast.
---

FrameCast must not persist user data or video. Video must travel directly from the phone to the TV. Pairing may need temporary signaling, but it must stay in memory, expire quickly, and avoid logging room identifiers.

**Why:** The user requires this for privacy in the UK and other countries.

**How to apply:** Keep media out of the API and persistent storage. If signaling or network metadata is processed temporarily, make that limitation clear and do not present the design as a legal-compliance certification.
