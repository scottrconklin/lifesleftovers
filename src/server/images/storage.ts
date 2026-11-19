import "server-only";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { AwsClient } from "aws4fetch";
import { requireEnv, serverEnv } from "@/lib/env";

/**
 * Object storage: Cloudflare R2 in production, RustFS locally; both speak the S3 API. Browsers
 * upload straight to storage with short-lived presigned PUT URLs, so the app never relays the
 * upload. Keys: u/<userId>/<uuid>.jpg for raw uploads (private), p/<photoId>.jpg for processed
 * photos (public).
 */

const PRESIGN_SECONDS = 5 * 60;

function client() {
  return new AwsClient({
    accessKeyId: requireEnv("S3_ACCESS_KEY_ID"),
    secretAccessKey: requireEnv("S3_SECRET_ACCESS_KEY"),
    service: "s3",
    region: serverEnv().S3_REGION,
  });
}

function objectUrl(key: string): string {
  const endpoint = requireEnv("S3_ENDPOINT").replace(/\/$/, "");
  const bucket = requireEnv("S3_BUCKET");
  const path = key.split("/").map(encodeURIComponent).join("/");
  if (serverEnv().S3_FORCE_PATH_STYLE) return `${endpoint}/${bucket}/${path}`;
  const url = new URL(endpoint);
  return `${url.protocol}//${bucket}.${url.host}/${path}`;
}

/** A URL the browser can PUT one JPEG to for the next few minutes. */
export async function presignUpload(key: string, contentType: string): Promise<string> {
  const url = new URL(objectUrl(key));
  url.searchParams.set("X-Amz-Expires", String(PRESIGN_SECONDS));
  const signed = await client().sign(url.toString(), {
    method: "PUT",
    headers: { "Content-Type": contentType },
    aws: { signQuery: true },
  });
  return signed.url;
}

/** Size of an object, or null if it doesn't exist. */
export async function objectSize(key: string): Promise<number | null> {
  const response = await client().fetch(objectUrl(key), { method: "HEAD" });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Storage HEAD failed: ${response.status}`);
  return Number(response.headers.get("content-length") ?? 0);
}

export async function getObject(key: string): Promise<Buffer> {
  const response = await client().fetch(objectUrl(key));
  if (!response.ok) throw new Error(`Storage GET failed: ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

export async function putObject(key: string, body: Buffer, contentType: string): Promise<void> {
  // Signed with aws4fetch but sent with node:http(s): Next's patched fetch streams request bodies
  // without a Content-Length, which S3-compatible stores reject (411).
  const signed = await client().sign(objectUrl(key), {
    method: "PUT",
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(body.length),
      // Processed photos never change (a new photo gets a new key).
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
  const status = await new Promise<number>((resolve, reject) => {
    const url = new URL(signed.url);
    const request = (url.protocol === "https:" ? httpsRequest : httpRequest)(
      url,
      { method: "PUT", headers: Object.fromEntries(signed.headers.entries()) },
      (response) => {
        response.resume();
        response.on("end", () => resolve(response.statusCode ?? 0));
      },
    );
    request.on("error", reject);
    request.end(body);
  });
  if (status < 200 || status >= 300) throw new Error(`Storage PUT failed: ${status}`);
}

export async function deleteObject(key: string): Promise<void> {
  const response = await client().fetch(objectUrl(key), { method: "DELETE" });
  if (!response.ok && response.status !== 404) {
    throw new Error(`Storage DELETE failed: ${response.status}`);
  }
}
