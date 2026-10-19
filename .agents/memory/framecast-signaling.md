---
name: FrameCast signaling contract
description: OpenAPI and generated Zod behavior for temporary phone-to-TV signaling messages.
---

Declare every FrameCast SDP payload property explicitly in the OpenAPI schema, including the nested session-description type and media kind. The generated Zod validator strips undeclared nested fields even when the OpenAPI payload allows additional properties.

**Why:** The TV cannot call `setRemoteDescription` when the API silently removes the SDP type; omitted media kind also makes received photos look like videos.

**How to apply:** When adding or changing signaling payload fields, update the OpenAPI source, run code generation, then verify the API preserves the fields in a POST/GET round trip.
