---
name: FrameCast App Store package size
description: Replit App Store publishing includes a broader project upload than normal deploys.
---

Replit Support states that App Store publishing uploads the whole project, not just the mobile artifact. It skips `node_modules`, `.git`, cache folders, and the top-level `attached_assets`, but does not honor `.gitignore`, `.replitignore`, or `.easignore`; generated build output may still be included.

**Why:** A large FrameCast upload failed before an App Store launch session began.

**How to apply:** Before App Store publishing, estimate compressed size using only the publisher's standard exclusions. Do not remove build outputs until the owner has chosen what to preserve. Keep Play upload keys secure and preserve the test APK debug signing key so test builds can update installed copies.
