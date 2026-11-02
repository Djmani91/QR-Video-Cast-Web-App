# FrameCast nearby-TV audit

## Expanded automatic scan

The scan is no longer restricted to Samsung, Google and Amazon. Discovery uses Android NSD and SSDP; no extra casting SDK is needed merely to find these advertisements.

| Family | Discovery | Current action / connection requirements |
| --- | --- | --- |
| Samsung | TV remote SSDP / validated TV descriptor | Existing approved browser launch plus actual TV-page acknowledgement; QR/code fallback |
| LG webOS | `urn:lge-com:service:webos-second-screen:1` | Browser instructions at `2tx1.com`; automatic control still needs a webOS SSAP pairing adapter and TV consent |
| Roku TVs and players, including Roku-based TCL/Hisense models | `roku:ecp` SSDP | Detected only. A Roku receiver channel and supported app-launch integration are required; no general browser is supplied by FrameCast |
| Google Cast / Google TV / Cast-enabled Android TVs | `_googlecast._tcp` DNS-SD | Detected only until a registered Cast receiver ID and sender/receiver integration are added |
| Fire TV | Existing Amazon advertisements | Manual Silk-browser instructions; newer models may not advertise the legacy service; supported receiver integration still required |
| Apple TV | `_airplay._tcp` plus an Apple TV model identity | Detected only, not Android AirPlay support. A separate receiver/supported casting integration is required |
| Compatible Sony BRAVIA, Philips, Panasonic VIERA, Hisense VIDAA, TCL, Sharp AQUOS, Vizio and other TV renderers | TV evidence in UPnP/DLNA descriptions, or their Cast/Roku/Fire platform above | Browser instructions where available; direct DLNA playback and automatic browser control are not implemented by discovery |

Models must be powered on, reachable on the same Wi-Fi, and advertise a supported protocol. This is not a promise of every brand/model being discoverable or connectable.

Metadata fetches accept only the SSDP responder's exact private IP, disable redirects/proxies, limit timeout/bytes/concurrency, and reject XML entities/DOCTYPE declarations. Audio-only Cast devices, HomePod/AirPlay speakers, and generic routers are excluded. Generic DLNA duplicates are suppressed where a specific platform is found at the same address.

Expansion sources:
- Roku: https://developer.roku.com/docs/developer-program/debugging/external-control-api.md
- LG-maintained Connect SDK discovery filter/browser capability: https://github.com/ConnectSDK/Connect-SDK-Android-Core/blob/master/src/com/connectsdk/service/WebOSTVService.java
- Google: https://developers.google.com/cast/docs/discovery
- Apple: https://support.apple.com/guide/deployment/use-airplay-dep9151c4ace/web

The original connection audit follows; this table expands its discovery scope.

## Scope and conclusion

Android can discover compatible local-network receivers. Discovery is not
authorization, browser-launch support, or proof of an active FrameCast session.
Opening the app should scan; only selecting a TV should request remote control.
QR/five-digit pairing remains available and is never removed.

| Receiver | Discovery | Automatic FrameCast launch in this change |
| --- | --- | --- |
| Compatible Samsung Smart TV | SSDP | Samsung LAN remote approval, browser-launch request, then actual TV-page acknowledgement |
| Chromecast / Google TV advertising Google Cast | DNS-SD `_googlecast._tcp.` | Detection only. A registered custom Cast receiver and Android sender integration are still required for the FrameCast screen |
| Fire TV advertising Amazon services | SSDP / legacy Amazon DNS-SD | Detection only. Manual Silk browser pairing remains available; native automatic support requires a receiver/Matter integration |
| Non-advertising, sleeping, isolated or unsupported TV | Not guaranteed | Open `2tx1.com` manually and scan/enter the displayed code |

Not every Fire TV advertises the legacy Amazon service. This is **not** a claim
of exhaustive Fire TV or Matter discovery. Google Cast audio devices may also
advertise the Cast service; they are detected only, not offered a video connection.
Guest Wi-Fi, multicast filtering, AP/client isolation, VPNs, and different
networks can prevent discovery even when both devices have internet access.

## Findings in the previous Samsung code

1. It tried only unencrypted port 8001, not secure port 8002.
2. It treated an HTTP WebSocket upgrade as remote authorization, sent the launch
   immediately, and disconnected without reading Samsung's approval event.
3. It could not receive/store a TV-issued authorization token or handle denial.
4. It reported command dispatch success without confirming the TV loaded FrameCast.
5. Discovery covered Samsung only, and the join-screen discovery entry had been
   removed at the customer's earlier request.

These explain plausible failure paths; they do not prove which one the customer's
specific TV encountered. Hardware verification is still required.

## Implemented behavior

- A bounded automatic scan when the Android pairing screen opens, plus Rescan.
- Samsung SSDP, Cast DNS-SD, and advertised Amazon services, capped/deduplicated
  and restricted to private IPv4 addresses. No network-wide port sweep.
- Samsung secure remote first, port 8001 fallback only for transport failure.
  A rejection, changed certificate or approval timeout does not trigger downgrade.
- Wait for `ms.channel.connect` before sending the Tizen browser launch.
  Honor unauthorized/timeout/error events and retain TV-issued tokens only in
  private on-device preferences.
- Samsung's self-signed certificate is trust-on-first-use for that private IP;
  pin it after approval. This is local trust, not public-CA authentication.
  A changed pinned identity blocks automatic launch; QR/code remains usable.
- Only HTTPS `2tx1.com`, without credentials/nonstandard ports, is launchable.
- Create an ephemeral pairing room, include its launch metadata in the TV URL,
  and wait for the actual TV page to report ready to signaling. No “connected”
  label based on advertisements, socket open, or command transmission.
- No response means a bounded error with QR/code fallback. Cancellation prevents
  a late response from pairing the phone; an already-submitted TV prompt may
  remain until its native request finishes.
- Chromecast/Fire entries explicitly disclose detection-only status.

## Platform evidence

- [Google Web Receiver overview](https://developers.google.com/cast/docs/web_receiver):
  the default receiver is a media player, not a general browser for a custom
  website; custom behavior requires a custom receiver.
- [Google Cast registration](https://developers.google.com/cast/docs/registration):
  custom receivers need an application ID, testing-device registration, and
  publication before general device use.
- [Amazon Matter Casting overview](https://developer.amazon.com/docs/fire-tv/overview-of-matter-casting.html):
  Fling has ended standard support; the supported replacement involves discovery,
  commissioning, attestation, and a content-app integration.
- [Maintained Samsung LAN remote connection implementation](https://github.com/xchwarze/samsung-tv-ws-api/blob/master/samsungtvws/connection.py):
  wait for channel-connect, handle authorization, and use TV tokens with secure
  remotes. This is community-maintained protocol evidence, not a universal
  Samsung consumer-TV browser-launch guarantee.
- [Samsung browser command implementation](https://github.com/xchwarze/samsung-tv-ws-api/blob/master/samsungtvws/remote.py):
  `ed.apps.launch`, `org.tizen.browser`, `NATIVE_LAUNCH`, and URL `metaTag`.

## Release and validation boundaries

New native functions require a rebuilt Android binary. Automatic pairing also
requires publishing the TV-page acknowledgement change. An older APK does not
have the new scan method and continues to show QR/code pairing only.

Unit checks cover discovery filtering, launch URL restrictions, cancellation,
and requiring a matching TV acknowledgement. Native compilation checks Android
API/dependency compatibility. These cannot verify Samsung remote approval,
browser launch, router multicast, actual Chromecast advertisements or Fire TV
behavior without those devices on the same network as the installed app.

Full native Cast and Matter receivers remain deferred, not implemented.
