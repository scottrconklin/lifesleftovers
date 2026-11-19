import { AwsClient } from "aws4fetch";
import sharp from "sharp";

/** Placeholder listing photos for local data, written straight to local storage (RustFS). */

function escapeXml(text: string): string {
  return text.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** Wrap a title into up to three short lines for the placeholder. */
function lines(title: string): string[] {
  const words = title.split(" ");
  const out: string[] = [];
  let line = "";
  for (const w of words) {
    if ((line + " " + w).trim().length > 18 && line) {
      out.push(line);
      line = w;
    } else {
      line = `${line} ${w}`.trim();
    }
  }
  if (line) out.push(line);
  return out.slice(0, 3);
}

export async function placeholderPhoto(
  title: string,
  color: string,
  note: string,
): Promise<Buffer> {
  const dark = ["#1B385B", "#477A59", "#D94B35"].includes(color);
  const ink = dark ? "#FFFFFF" : "#1B385B";
  const text = lines(title)
    .map((l, i) => `<text x="400" y="${360 + i * 64}" text-anchor="middle">${escapeXml(l)}</text>`)
    .join("");
  const svg = `<svg width="800" height="800" xmlns="http://www.w3.org/2000/svg">
    <rect width="800" height="800" fill="${color}"/>
    <g font-family="sans-serif" font-size="52" font-weight="700" fill="${ink}">${text}</g>
    <text x="400" y="720" text-anchor="middle" font-family="sans-serif" font-size="26" fill="${ink}" opacity="0.7">${escapeXml(note)}</text>
  </svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 70 }).toBuffer();
}

export function storageClient() {
  const endpoint = process.env.S3_ENDPOINT;
  const bucket = process.env.S3_BUCKET;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
    throw new Error("S3_* variables are missing from .env.local");
  }
  const aws = new AwsClient({
    accessKeyId,
    secretAccessKey,
    service: "s3",
    region: process.env.S3_REGION ?? "auto",
  });
  const url = (key: string) => `${endpoint.replace(/\/$/, "")}/${bucket}/${key}`;
  return {
    async exists(key: string) {
      return (await aws.fetch(url(key), { method: "HEAD" })).ok;
    },
    async put(key: string, body: Buffer) {
      const response = await aws.fetch(url(key), {
        method: "PUT",
        body: new Uint8Array(body),
        headers: {
          "Content-Type": "image/jpeg",
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
      if (!response.ok)
        throw new Error(`Seed photo upload failed: ${response.status}. Is RustFS running?`);
    },
  };
}
