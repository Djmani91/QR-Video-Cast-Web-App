---
name: FrameCast App Store package size
description: Replit App Store publishing includes a broader project upload than normal deploys.
---

Replit Support states that App Store publishing uploads the whole project, not just the mobile artifact. It skips `node_modules`, `.git`, cache folders, and the top-level `attached_assets`, but does not honor `.gitignore`, `.replitignore`, or `.easignore`; generated build output may still be included.

**Why:** A large FrameCast upload failed before an App Store launch session began.

**How to apply:** Before App Store publishing, estimate package size using the publisher's exclusions. Keep Android build archives under top-level `attached_assets` so they stay in the workspace but out of the iOS upload; restore them to `generated-artifacts` before a local Android build. Preserve Play upload keys and the test APK debug key.
