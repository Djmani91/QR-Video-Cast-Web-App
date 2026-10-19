# Direct Wi-Fi video playback

The native phone app hosts the selected video temporarily on the local network.
The TV browser opens a small receiver page from that same phone and reads the
original video using HTTP byte-range requests. There is no full video upload,
cloud media relay, JavaScript whole-file buffer, or additional video copy for
the local server. Android content-provider files may still need the existing
temporary on-phone staging step to preserve picker permissions.

The receiver is served from the phone rather than embedded in the HTTPS website:
an HTTPS page cannot reliably embed private-network HTTP media. The phone gives
the paired TV a random, session-only address. Directory listing is disabled and
only the receiver page and selected media file are reachable. Other phone files
are not served. The server closes on disconnect or replacement; original videos
are never deleted by the server.

Only temporary pairing/control/playback-status messages use the existing HTTPS
signaling API. Those contain no media bytes. Playback snapshots are replaced
rather than accumulating until a long film exhausts the room.

## Native build required

This uses a native HTTP server, so it cannot run in Expo Go or a phone browser.
Changing JavaScript or restarting Metro does **not** update an existing installed
native binary. Rebuild the iOS/Android development client after installing these
dependencies. Internal development/preview profiles are provided in `eas.json`.

Before an EAS build, link the app to the owner's Expo project. For a standalone
preview build, supply `EXPO_PUBLIC_DOMAIN` as a build environment variable pointing
to the actual published FrameCast API host. Obtain that host using the deployment
tools, not a temporary development URL. The native server requires CMake on the
build host; use its documented build prerequisites. No linked EAS project,
installable APK/IPA, or successful native compilation is implied by these files.

## Verification

Run `node --test artifacts/framecast-mobile/tests/local-receiver.test.mjs` from
the workspace root for receiver protocol/control tests. Run the mobile, web and
API TypeScript checks after modifying the signaling contract.

Still requires a rebuilt native app and a physical same-Wi-Fi phone/TV test:

- Confirm the server starts and that only the random receiver/media paths work.
- Check `Range: bytes=0-1023` returns 206 and the exact Content-Range.
- Confirm first playback starts before the full file is read, including an MP4
  with its metadata at the end, and seeking near the end of a long video works.
- Exercise mute, volume, seek, pause, disconnect/rejoin, photo casting after
  video, and changing videos. Inspect both Android and iOS builds.
- Try the actual Samsung model and representative H.264 and HEVC phone files.

The TV must still decode the original codec. No arbitrary-format conversion or
DRM bypass is provided. Fullscreen/autoplay permission is controlled by the TV
browser; a visible TV button is retained when a remote click is required. Keep
FrameCast open on the phone: screen-awake protection does not grant indefinite
iOS background execution or guarantee playback after the phone is locked.
