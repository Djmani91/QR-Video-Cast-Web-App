---
name: FrameCast Samsung TV target
description: The user's preferred approach for Samsung TV support in FrameCast.
---

For Samsung TVs, target the built-in TV browser using the existing web app; do not build a native Tizen app unless requested.

**Why:** The user briefly requested a native TV player because videos failed, then demonstrated Web Video Caster working in the Samsung browser and asked for that same experience without a separate Samsung app.

**How to apply:** Keep the Samsung browser receiver and native phone companion. Prioritize playback that starts before a full video transfer; verify the real TV before claiming compatibility.

For phone-to-TV pairing, retain the short TV browser address and manual code entry alongside nearby-TV discovery. The owner now requires code-only pairing without QR; see framecast-pairing-choice.md.

**Why:** The user previously removed discovery because Samsung “Connect” did not open the browser, then explicitly asked to restore it with a properly audited launch/approval flow on 2026-11-02.

**How to apply:** This removal was superseded by the customer's explicit request on 2026-11-02 to restore nearby-device scanning and assisted Samsung browser launch. Preserve browser/code pairing as the reliable fallback; do not label discovery or command dispatch as a connected TV.

Scan automatically on the Android pairing screen, but request remote control/browser launch only after the customer selects a TV. Finish automatic pairing only after the TV webpage itself confirms that it loaded.

**Why:** The customer asked again for same-Wi-Fi Samsung, Chromecast and Fire TV discovery and automatic browser setup. Earlier attempts found Samsung devices but did not open their browsers; a detected device is not a connected receiver.

**How to apply:** Samsung browser launch depends on model support and TV approval. Google Cast requires an actual Cast receiver session, not the ordinary TV website; Fire TV's supported route requires Matter/content-app integration. Be explicit about detection-only entries until actual connection paths exist. Do not silently switch to unsupported legacy casting or claim hardware verification from software tests.

Keep this a phone-app-only product: do not require customers to install a separate FrameCast TV receiver app.

**Why:** On 2026-11-02, the user explicitly chose “No, phone app only” after the Fire TV receiver requirement was explained.

**How to apply:** Prefer receivers already built into supported devices and retain browser-code pairing. Do not promise universal tap-to-connect Fire TV support when its available receiver cannot accept FrameCast media. Revisit a separate TV app only if the user changes this scope.

The user wants automatic nearby scanning across common European and American TV/streaming platforms, not a list restricted to Samsung, Chromecast and Amazon; those were examples.

**Why:** The user explicitly clarified that the three named platforms were not the limit of the product's discovery scope.

**How to apply:** Discover by advertised capabilities/protocols, not just brand-name matching. A detected device must not be represented as connected, nor should browser launch be promised for unsupported platforms. Preserve browser/code pairing for TVs with a browser.

The current desired default is whole-browser fullscreen after phone pairing, with an animated connected cinema screen (photos, movie cards and popcorn) while waiting and between videos. This supersedes the earlier video-only fullscreen request.

**Why:** The user repeatedly reported a distracting QR-page flash and fullscreen changes between videos, and explicitly requested a full-screen animated connected page instead.

**How to apply:** Treat ending/replacing media separately from unpairing. Keep the connected waiting page and page fullscreen during media handoffs; show a fresh pairing code only on actual disconnect/new-room flow. Request fullscreen best-effort and retain a clear TV-remote fallback; browser restrictions still apply.

The user previously confirmed video fullscreen on their Samsung TV; the model was not supplied. Only use a native-video fullscreen path when source support is explicitly confirmed. Otherwise use container fullscreen for videos and photos.

**Why:** The user then showed sideways video despite working fullscreen. A TV's native media overlay can bypass CSS transforms, and fragmented-video rotation metadata is not handled consistently across TV players. Genuine portrait footage must not be stretched to landscape.

**How to apply:** Keep source rotation separate from encoded dimensions and avoid applying it twice. Desktop CSS-transform checks are not proof of Samsung compatibility. Prefer correcting local browser video on the phone and sending already-upright frames to the TV's inline WebRTC player. Do not switch the TV into a canvas or CSS rotation path when rotating this stream, and do not claim hardware compatibility until verified on the TV.

Default to Fit whole video. Keep the picture upright and uncropped; any optional Fill TV screen mode must not stretch or rotate people sideways.

**Why:** The user later explicitly changed the requested default to “fit whole video,” not Fill TV screen, including in the native app.

**How to apply:** Treat orientation and aspect-ratio fit as separate controls. Preserve the complete picture by default; explain that filling a wide screen with portrait footage crops it and keep that choice reversible.

Keep the underlying video visible and full-sized when using a canvas overlay. If corrected-picture drawing is unsupported, keep standard video playback running and explain the presentation limitation instead of pausing the decoder.

**Why:** The user reported previously playable video failing after the wide-screen drawing change. Offscreen/tiny video is unsafe for TV decoder compatibility, and failure of a display enhancement must not stop otherwise supported playback.

**How to apply:** Never rely on desktop drawing checks as proof of Samsung playback. Distinguish actual playing, autoplay permission requiring the TV remote, and real decoder errors. Preserve specific TV feedback rather than replacing it with a generic format warning after a short timeout.

The user reports that TV-side Rotate can produce a black picture while audio continues, and cycling rotation restores the uncorrected picture. A drawing API being available or not throwing is not evidence that the TV can display decoded frames through it.

**Why:** Exception-only fallback and desktop rendering checks did not catch the Samsung display failure.

**How to apply:** For phone-browser files, rotate and crop on the phone with a stable outgoing media track, rather than changing the TV video surface. Relay seek/play/pause/Rotate/Fill commands to the phone's source file; the receiving live video's clock is not the file timeline. Keep phone preview mute separate from TV audio. Confirm decoded video dimensions before reporting TV playback.

Do not treat a fullscreen API call returning without an exception as proof that fullscreen was entered. Some native file-player APIs can silently do nothing for a WebRTC stream.

**Why:** The user reports browser chrome still visible after live-video changes, and later confirms Samsung automatic video fullscreen previously worked but regressed. Samsung's native media entry and general browser fullscreen are not interchangeable.

**How to apply:** Never probe native movie-player fullscreen for WebRTC streams. An exposed legacy method is not proof of source support: it can open the Samsung system “This function is not supported” dialog rather than reject in JavaScript. Keep video inline and use container fullscreen unless native source support is affirmative. Keep a separate TV fullscreen permission button visible outside the five-second controls timeout. Report actual TV state to the phone and explain when a TV-remote gesture or browser menu is required. A phone click cannot transfer browser user activation to the TV, and desktop checks cannot prove physical Samsung compatibility.

Known orientation for a normalized stream must remain authoritative even while the video element reports zero dimensions.

**Why:** Loading and fullscreen transitions can temporarily clear intrinsic dimensions. Treating that as zero rotation can re-enable the TV's native overlay and bypass the intended correction, even when the original file's rotation metadata is correct.

**How to apply:** Clear known rotation only when changing media, not when dimensions temporarily disappear. Check renderer compatibility before sending videos: a TV room can remain open across a publish, so a freshly loaded phone must not silently assume the TV has refreshed too.

**Why:** The user explicitly described this behavior in their Web Video Caster recording and wants FrameCast to behave similarly.

**How to apply:** Distinguish video-player fullscreen from making the entire browser page fullscreen. Explain browser permission limits and verify remote Back behavior rather than assuming either works.

After a phone pairs, the user wants the TV to switch to a full-viewport cinema standby screen and remain there until disconnect. Keep this separate from the active video player's native fullscreen behavior.

**Why:** The user specifically asked for a persistent, animated movie-theater standby screen on the Samsung TV after pairing, with popcorn and cinema imagery.

**How to apply:** Make the page fill the TV viewport whether or not browser fullscreen is granted. Try document fullscreen once per paired room, but keep a clearly visible remote-selectable Full screen button because Samsung may block automatic fullscreen. Do not replace or disrupt the existing active-media fullscreen path.

When a playlist video ends, keep the TV on its full-screen player while the next video loads; do not flash the pairing QR or return to the main page between tracks.

**Why:** The user explicitly requested a steady full-screen handoff with a brief loading state instead of the player shrinking and the TV showing its pairing screen.

**How to apply:** Notify the TV before switching the phone connection, preserve the immersive TV layout through the next-video transfer, and clear the loading state when playback starts. Validate on the real Samsung TV.

An explicit customer Disconnect must return the TV to a newly created pairing room with a fresh QR/code. Media-only stops, playlist handoffs, and temporary connection recovery must not rotate the room.

**Why:** The user explicitly asked for a new TV code after disconnecting from the phone, while also requiring uninterrupted video handoffs and recoverable connections.

**How to apply:** Distinguish a room disconnect from a transport/media close, including when the TV is on the phone-hosted local receiver. Discard resume markers on an explicit disconnect, not during ordinary playback recovery.

Do not diagnose Samsung's “This function is not supported” dialog as a fullscreen failure from the wording alone. Fullscreen capability does not establish video-decoder compatibility, and MP4 is a container, not a codec.

**Why:** The user's supplied phone footage includes HEVC/H.265 inside MP4. Repeated fullscreen changes did not resolve the reported playback failure. Repackaging that video does not turn it into H.264.

**How to apply:** Inspect the actual source codec and distinguish decoding, transport, and fullscreen failures. A compatible H.264 rendition of the same content is a useful hardware control before another speculative APK; do not claim HEVC incompatibility on this TV is conclusively proven without that comparison.

Samsung TV discovery only confirms that the device is present. Open its built-in browser by sending `ms.channel.emit` with `event: ed.apps.launch`, `to: host`, and `data` containing `appId: org.tizen.browser`, `action_type: NATIVE_LAUNCH`, and the target URL in `metaTag`. If remote text entry is needed, Samsung expects `SendInputString` with the text Base64-encoded in `Cmd` and `DataOfCmd: base64`; ordinary key presses do not substitute for that payload.

**Why:** Earlier builds found the TV and established a WebSocket connection but the `KEY_BROWSER`/Ctrl+L sequence and plain-text input command did not open the browser. The maintained Samsung WebSocket implementation launches the browser through `ed.apps.launch`; its text-input command uses Base64 encoding.

**How to apply:** Use this sequence only for a user-selected Samsung launch attempt, never to take over TVs merely because an automatic scan found them. Never report success based only on SSDP discovery, a WebSocket handshake, or sending the request; verify the receiver page actually opened.

Local TV discovery must use the physical Wi-Fi network, not the phone's default route, and must not change the whole application's network binding.

**Why:** A phone can be connected to the same Wi-Fi as a TV while mobile data or a VPN owns its default route. An empty scan is therefore not proof that the TV is absent or incompatible.

**How to apply:** Bind discovery UDP and descriptor HTTP to Wi-Fi; use network-scoped DNS-SD where Android supports it. Distinguish network errors from no replies, retain QR/code pairing, and do not promise a device will advertise through guest-network isolation or restrictive VPN/router policies.

Repeated empty scans need stage-level diagnostics, not another assumption about VPNs or Wi-Fi settings.

**Why:** The customer confirmed same-Wi-Fi operation without VPN/proxy, yet the Wi-Fi-bound release still found none of their devices. Routing changes and passing software tests did not establish a hardware fix.

**How to apply:** Expose reply, description and resolution/error counts locally when no TV is identified. Do not upload device inventories or claim the physical scan works until actual receiver evidence is available.

TV discovery must be checked against Android's release network-security policy, not only debug networking. SSDP/DIAL metadata commonly uses local plain HTTP.

**Why:** Debug networking can permit HTTP while a target-SDK release blocks it, leaving a scan with many LAN replies but no readable descriptions. Protocol-parser tests cannot catch that difference.

**How to apply:** Verify the release merged manifest permits the required local protocol. Keep discovery HTTP restricted in code to the advertising private peer, without redirects or credentials, and keep cloud traffic HTTPS. Do not interpret unread descriptions as proof that no TV advertised.
