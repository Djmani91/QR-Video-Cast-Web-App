---
name: FrameCast signaling contract
description: OpenAPI and generated Zod behavior for temporary phone-to-TV signaling messages.
---

Declare every FrameCast SDP payload property explicitly in the OpenAPI schema, including the nested session-description type and media kind. The generated Zod validator strips undeclared nested fields even when the OpenAPI payload allows additional properties.

**Why:** The TV cannot call `setRemoteDescription` when the API silently removes the SDP type; omitted media kind also makes received photos look like videos.

**How to apply:** When adding or changing signaling payload fields, update the OpenAPI source, run code generation, then verify the API preserves the fields in a POST/GET round trip.

Browser reconnection attempts need separate short-lived session markers, and asynchronous callbacks must confirm they still belong to the active peer before changing shared playback or connection state.

**Why:** Returning from the background or quickly selecting another video can leave an old answer, ICE candidate, close message, or rejected negotiation promise racing with a replacement peer. An obsolete failure must not close the new working connection or force another QR pairing.

**How to apply:** Correlate signaling using the existing declared session marker, buffer early ICE until its matching offer, and ignore obsolete replies/closes. The marker identifies a negotiation, not a permanently tracked phone; retain the existing room rather than adding a device fingerprint or storing media.
