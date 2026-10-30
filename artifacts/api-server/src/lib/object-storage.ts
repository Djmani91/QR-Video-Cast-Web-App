import { Storage } from "@google-cloud/storage";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

export const objectStorageClient = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: {
        type: "json",
        subject_token_field_name: "access_token",
      },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

const FRAMECAST_RELEASE_OBJECT =
  "framecast-releases/FrameCast-Android-1.1.10.aab";

export function getFrameCastReleaseAabFile() {
  return getFrameCastAabFile(FRAMECAST_RELEASE_OBJECT);
}

export function getFrameCastTvDiscoveryAabFile(
  version: "1.1.11" | "1.1.12" = "1.1.11",
) {
  return getFrameCastAabFile(`framecast-releases/FrameCast-Android-${version}.aab`);
}

function getFrameCastAabFile(objectName: string) {
  const bucketName = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
  if (!bucketName) {
    throw new Error("Object Storage bucket is not configured.");
  }

  return objectStorageClient.bucket(bucketName).file(objectName);
}
