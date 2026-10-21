---
name: Local Android build environment
description: Local Android toolchain, permissions, and isolation of native build caches from publishing.
---

For local Android builds, resolve Android packages from the Nix flake registry rather than importing `<nixpkgs>`. If the full Nix SDK closure fails on `ncurses-abi5-compat` with a 32-bit `bash` `Exec format error`, use a minimal Nix command-line-tools SDK and install the required official packages with `sdkmanager` into ignored generated artifacts. The SDK-managed AAPT2 executable runs in this workspace.

**Why:** In this workspace, `<nixpkgs>` resolves a legacy catalogue lacking Android build tools 36, while the registered `nixpkgs` flake provides the required SDK and NDK. Some full Nix SDK compositions also require a 32-bit helper the container cannot execute. Evaluating only the package name does not detect missing component versions; evaluating the derivation path does.

**How to apply:** Import the flake's `outPath` and validate SDK component versions. If its full closure fails on the 32-bit helper, keep the Nix SDK minimal and install the exact Gradle-requested Build Tools, platform, NDK, and CMake packages with `sdkmanager`. Keep the toolchain, caches, native project and outputs under ignored generated-artifact directories. Prefer SDK-provided AAPT2 over Maven's executable. Obtain Android SDK licence consent for each build; a one-build approval is not standing approval for future builds.

Verify permissions in the generated and merged Android manifests, not just Expo's configuration.

**Why:** Setting `cameraPermission: false` on Expo's image-picker plugin removes CAMERA from the shared Android manifest, including for a separate QR scanner. Listing CAMERA in the app's permissions array is not enough to counter that removal.

**How to apply:** When any app feature needs a camera, avoid disabling the shared permission in another plugin. Check that CAMERA is present without a removal directive before packaging and inspect the finished APK's permissions.

Gradle dependencies can request SDK component versions beyond the app's root compile SDK setup.

**Why:** This build required Build Tools 35 as well as 36, and a second NDK version for a native module. Gradle attempted to install the missing pieces into the immutable Nix SDK and failed.

**How to apply:** Read the first failed Gradle SDK-package request and include its exact Build Tools/NDK versions in the local SDK composition before retrying; do not assume the app's `ndkVersion` or `buildToolsVersion` covers every native module.

Keep native dependency compilation caches out of web publishing, not just the generated app project and APK output.

**Why:** Local Android builds generate multi-gigabyte native caches inside pnpm dependencies. Package-store pruning does not remove these modified dependency outputs; publishing has attempted to upload their compiled libraries and failed before the application could start.

**How to apply:** After local native builds, account for generated Android build, CMake, and Gradle caches throughout dependencies when sizing the publishing bundle. Preserve runtime JavaScript packages and local APK build caches; exclude native compilation output from publishing rather than removing all dependencies.

Use Android-aware validators for APK packaging; do not rewrite a signed APK to satisfy generic ZIP tools.

**Why:** This environment's InfoZIP rejects Android alignment extra fields as invalid even when APK signatures, Android alignment validation, and entry CRCs are valid. Repacking would invalidate the signature.

**How to apply:** Prefer Android signature/alignment checks and a compatible ZIP reader for CRC validation. When inspecting Hermes bundles, check UTF-16 as well as ASCII: a whole HTML template containing Unicode can be stored as UTF-16, so an ASCII-only search can falsely suggest stale source.
