import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { Router, type IRouter } from "express";

const router: IRouter = Router();
const apkPath = resolve(
  process.cwd(),
  "../../generated-artifacts/framecast-apk-20261029/FrameCast-Android-1.1.6-test.apk",
);
const diagnosticApkPath = apkPath;
const releaseAabPath = resolve(
  process.cwd(),
  "../../generated-artifacts/framecast-play-release/FrameCast-Android-1.1.6.aab",
);

router.get("/download/framecast.apk", (_req, res): void => {
  if (!existsSync(apkPath)) {
    res.status(404).send("The FrameCast APK is not available in this workspace.");
    return;
  }

  res.setHeader("Content-Type", "application/vnd.android.package-archive");
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="FrameCast-Android-1.1.6-test.apk"',
  );
  res.setHeader("Cache-Control", "no-store");
  res.sendFile(apkPath, (error) => {
    if (error && !res.headersSent) {
      res.status(500).send("The FrameCast APK could not be downloaded.");
    }
  });
});

router.get("/download/framecast-diagnostic.apk", (_req, res): void => {
  if (!existsSync(diagnosticApkPath)) {
    res.status(404).send("The diagnostic FrameCast APK is not available.");
    return;
  }

  res.setHeader("Content-Type", "application/vnd.android.package-archive");
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="FrameCast-Android-1.1.6-test.apk"',
  );
  res.setHeader("Cache-Control", "no-store");
  res.sendFile(diagnosticApkPath, (error) => {
    if (error && !res.headersSent) {
      res.status(500).send("The diagnostic FrameCast APK could not be downloaded.");
    }
  });
});

router.get("/download/framecast-release.aab", (_req, res): void => {
  if (!existsSync(releaseAabPath)) {
    res.status(404).send("The FrameCast Android App Bundle is not available.");
    return;
  }

  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="FrameCast-Android-1.1.6.aab"',
  );
  res.setHeader("Cache-Control", "no-store");
  res.sendFile(releaseAabPath, (error) => {
    if (error && !res.headersSent) {
      res.status(500).send("The FrameCast Android App Bundle could not be downloaded.");
    }
  });
});

export default router;
