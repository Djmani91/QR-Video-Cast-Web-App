import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { Router, type IRouter, type Request, type Response } from "express";
import { logger } from "../lib/logger";
import {
  getFrameCastReleaseAabFile,
  getFrameCastTvDiscoveryAabFile,
} from "../lib/object-storage";

const router: IRouter = Router();
const apkPath = resolve(
  process.cwd(),
  "../../generated-artifacts/framecast-apk-20261029/FrameCast-Android-1.1.6-test.apk",
);
const diagnosticApkPath = apkPath;

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

router.get("/download/framecast-release.aab", (req, res) =>
  sendFrameCastAab(req, res, getFrameCastReleaseAabFile, "1.1.10"),
);
router.head("/download/framecast-release.aab", (req, res) =>
  sendFrameCastAab(req, res, getFrameCastReleaseAabFile, "1.1.10"),
);
router.get("/download/framecast-release-1.1.11.aab", (req, res) =>
  sendFrameCastAab(req, res, getFrameCastTvDiscoveryAabFile, "1.1.11"),
);
router.head("/download/framecast-release-1.1.11.aab", (req, res) =>
  sendFrameCastAab(req, res, getFrameCastTvDiscoveryAabFile, "1.1.11"),
);
router.get("/download/framecast-release-1.1.12.aab", (req, res) =>
  sendFrameCastAab(
    req,
    res,
    () => getFrameCastTvDiscoveryAabFile("1.1.12"),
    "1.1.12",
  ),
);
router.head("/download/framecast-release-1.1.12.aab", (req, res) =>
  sendFrameCastAab(
    req,
    res,
    () => getFrameCastTvDiscoveryAabFile("1.1.12"),
    "1.1.12",
  ),
);
router.get("/download/framecast-release-1.1.13.aab", (req, res) =>
  sendFrameCastAab(
    req,
    res,
    () => getFrameCastTvDiscoveryAabFile("1.1.13"),
    "1.1.13",
  ),
);
router.head("/download/framecast-release-1.1.13.aab", (req, res) =>
  sendFrameCastAab(
    req,
    res,
    () => getFrameCastTvDiscoveryAabFile("1.1.13"),
    "1.1.13",
  ),
);
router.get("/download/framecast-release-1.1.14.aab", (req, res) =>
  sendFrameCastAab(
    req,
    res,
    () => getFrameCastTvDiscoveryAabFile("1.1.14"),
    "1.1.14",
  ),
);
router.head("/download/framecast-release-1.1.14.aab", (req, res) =>
  sendFrameCastAab(
    req,
    res,
    () => getFrameCastTvDiscoveryAabFile("1.1.14"),
    "1.1.14",
  ),
);
router.get("/download/framecast-release-1.1.15.aab", (req, res) =>
  sendFrameCastAab(
    req,
    res,
    () => getFrameCastTvDiscoveryAabFile("1.1.15"),
    "1.1.15",
  ),
);
router.head("/download/framecast-release-1.1.15.aab", (req, res) =>
  sendFrameCastAab(
    req,
    res,
    () => getFrameCastTvDiscoveryAabFile("1.1.15"),
    "1.1.15",
  ),
);
router.get("/download/framecast-release-1.1.16.aab", (req, res) =>
  sendFrameCastAab(
    req,
    res,
    () => getFrameCastTvDiscoveryAabFile("1.1.16"),
    "1.1.16",
  ),
);
router.head("/download/framecast-release-1.1.16.aab", (req, res) =>
  sendFrameCastAab(
    req,
    res,
    () => getFrameCastTvDiscoveryAabFile("1.1.16"),
    "1.1.16",
  ),
);
router.get("/download/framecast-release-1.1.17.aab", (req, res) =>
  sendFrameCastAab(
    req,
    res,
    () => getFrameCastTvDiscoveryAabFile("1.1.17"),
    "1.1.17",
  ),
);
router.head("/download/framecast-release-1.1.17.aab", (req, res) =>
  sendFrameCastAab(
    req,
    res,
    () => getFrameCastTvDiscoveryAabFile("1.1.17"),
    "1.1.17",
  ),
);
router.get("/download/framecast-release-1.1.18.aab", (req, res) =>
  sendFrameCastAab(
    req,
    res,
    () => getFrameCastTvDiscoveryAabFile("1.1.18"),
    "1.1.18",
  ),
);
router.head("/download/framecast-release-1.1.18.aab", (req, res) =>
  sendFrameCastAab(
    req,
    res,
    () => getFrameCastTvDiscoveryAabFile("1.1.18"),
    "1.1.18",
  ),
);

router.route("/download/framecast-release-1.1.19.aab")
  .get((req, res) => sendFrameCastAab(req, res, () => getFrameCastTvDiscoveryAabFile("1.1.19"), "1.1.19"))
  .head((req, res) => sendFrameCastAab(req, res, () => getFrameCastTvDiscoveryAabFile("1.1.19"), "1.1.19"));

router.route("/download/framecast-release-1.1.20.aab")
  .get((req, res) => sendFrameCastAab(req, res, () => getFrameCastTvDiscoveryAabFile("1.1.20"), "1.1.20"))
  .head((req, res) => sendFrameCastAab(req, res, () => getFrameCastTvDiscoveryAabFile("1.1.20"), "1.1.20"));

router.route("/download/framecast-release-1.1.21.aab")
  .get((req, res) => sendFrameCastAab(req, res, () => getFrameCastTvDiscoveryAabFile("1.1.21"), "1.1.21"))
  .head((req, res) => sendFrameCastAab(req, res, () => getFrameCastTvDiscoveryAabFile("1.1.21"), "1.1.21"));

router.route("/download/framecast-release-1.1.22.aab")
  .get((req, res) => sendFrameCastAab(req, res, () => getFrameCastTvDiscoveryAabFile("1.1.22"), "1.1.22"))
  .head((req, res) => sendFrameCastAab(req, res, () => getFrameCastTvDiscoveryAabFile("1.1.22"), "1.1.22"));

router.route("/download/framecast-release-1.1.23.aab")
  .get((req, res) => sendFrameCastAab(req, res, () => getFrameCastTvDiscoveryAabFile("1.1.23"), "1.1.23"))
  .head((req, res) => sendFrameCastAab(req, res, () => getFrameCastTvDiscoveryAabFile("1.1.23"), "1.1.23"));

router.route("/download/framecast-release-1.1.24.aab")
  .get((req, res) => sendFrameCastAab(req, res, () => getFrameCastTvDiscoveryAabFile("1.1.24"), "1.1.24"))
  .head((req, res) => sendFrameCastAab(req, res, () => getFrameCastTvDiscoveryAabFile("1.1.24"), "1.1.24"));

async function sendFrameCastAab(
  req: Request,
  res: Response,
  getFile: typeof getFrameCastReleaseAabFile,
  version: string,
): Promise<void> {
  try {
    const file = getFile();
    const [exists] = await file.exists();
    if (!exists) {
      res.status(404).send("The FrameCast Android App Bundle is not available.");
      return;
    }

    const [metadata] = await file.getMetadata();
    const size = Number(metadata.size);
    if (!Number.isSafeInteger(size) || size <= 0) {
      throw new Error("The stored FrameCast AAB has invalid size metadata.");
    }

    res.setHeader("Content-Type", "application/vnd.android.package-archive");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="FrameCast-Android-${version}.aab"`,
    );
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Accept-Ranges", "bytes");

    const rangeHeader = req.headers.range;
    const range = rangeHeader ? parseByteRange(rangeHeader, size) : null;
    if (rangeHeader && !range) {
      res.setHeader("Content-Range", `bytes */${size}`);
      res.status(416).end();
      return;
    }

    if (range) {
      const contentLength = range.end - range.start + 1;
      res.status(206);
      res.setHeader(
        "Content-Range",
        `bytes ${range.start}-${range.end}/${size}`,
      );
      res.setHeader("Content-Length", String(contentLength));
    } else {
      res.setHeader("Content-Length", String(size));
    }

    if (req.method === "HEAD") {
      res.end();
      return;
    }

    const stream = range
      ? file.createReadStream({ start: range.start, end: range.end })
      : file.createReadStream();
    stream.on("error", (error: Error) => {
      logger.error({ err: error }, "Failed to stream FrameCast AAB");
      if (!res.headersSent) {
        res.status(500).send("The FrameCast Android App Bundle could not be downloaded.");
      } else {
        res.destroy(error);
      }
    });
    stream.pipe(res);
  } catch (error) {
    logger.error({ err: error }, "Failed to prepare FrameCast AAB download");
    if (!res.headersSent) {
      res.status(500).send("The FrameCast Android App Bundle could not be downloaded.");
    }
  }
}

function parseByteRange(
  value: string,
  size: number,
): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2])) return null;

  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return null;
    return { start: Math.max(0, size - suffixLength), end: size - 1 };
  }

  const start = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : size - 1;
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(requestedEnd) ||
    start < 0 ||
    start >= size ||
    requestedEnd < start
  ) {
    return null;
  }

  return { start, end: Math.min(requestedEnd, size - 1) };
}

export default router;
