import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { Router, type IRouter } from "express";

const router: IRouter = Router();
const apkPath = resolve(
  process.cwd(),
  "../../generated-artifacts/framecast-local-player-fit-1.0.9/FrameCast-Fit-Rotation-1.0.9.apk",
);

router.get("/download/framecast.apk", (_req, res): void => {
  if (!existsSync(apkPath)) {
    res.status(404).send("The FrameCast APK is not available in this workspace.");
    return;
  }

  res.setHeader("Content-Type", "application/vnd.android.package-archive");
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="FrameCast-Fit-Rotation-1.0.9.apk"',
  );
  res.setHeader("Cache-Control", "no-store");
  res.sendFile(apkPath, (error) => {
    if (error && !res.headersSent) {
      res.status(500).send("The FrameCast APK could not be downloaded.");
    }
  });
});

export default router;
