import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { listings, watches } from "@/db/schema";

export async function isWatching(userId: string, listingId: string): Promise<boolean> {
  const [row] = await getDb()
    .select({ listingId: watches.listingId })
    .from(watches)
    .where(and(eq(watches.userId, userId), eq(watches.listingId, listingId)))
    .limit(1);
  return Boolean(row);
}

/** Flip watching on or off; returns the new state. */
export async function toggleWatch(userId: string, listingId: string): Promise<boolean> {
  const removed = await getDb()
    .delete(watches)
    .where(and(eq(watches.userId, userId), eq(watches.listingId, listingId)))
    .returning({ listingId: watches.listingId });
  if (removed.length > 0) return false;
  await getDb().insert(watches).values({ userId, listingId }).onConflictDoNothing();
  return true;
}

export async function watchedListingIds(userId: string): Promise<string[]> {
  const rows = await getDb()
    .select({ id: watches.listingId })
    .from(watches)
    .innerJoin(listings, eq(listings.id, watches.listingId))
    .where(eq(watches.userId, userId))
    .orderBy(desc(watches.createdAt));
  return rows.map((r) => r.id);
}
