import "server-only";
import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { getDb } from "@/db/client";
import { userDevices } from "@/db/schema";
import { DEVICE_COOKIE } from "@/lib/device-cookie";

/**
 * A device is a random first-party ID cookie (set by the proxy). Accounts seen on the same device
 * can't bid on each other's items (SPEC "Fake bidding"). Only a hash is stored.
 */
export function hashDeviceId(id: string): string {
  return createHash("sha256").update(`ll-device:${id}`).digest("hex");
}

export async function currentDeviceHash(): Promise<string | null> {
  const id = (await cookies()).get(DEVICE_COOKIE)?.value;
  return id && /^[0-9a-f-]{36}$/.test(id) ? hashDeviceId(id) : null;
}

/** Link this request's device to the member (called when they bid or list). */
export async function recordDevice(userId: string): Promise<void> {
  const hash = await currentDeviceHash();
  if (!hash) return;
  await getDb()
    .insert(userDevices)
    .values({ userId, deviceHash: hash })
    .onConflictDoUpdate({
      target: [userDevices.userId, userDevices.deviceHash],
      set: { lastSeenAt: sql`now()` },
    });
}
