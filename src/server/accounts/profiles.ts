import "server-only";
import { and, eq, isNull, ne } from "drizzle-orm";
import { getDb } from "@/db/client";
import { users, type UserRow } from "@/db/schema";
import { defaultDisplayName, type ProfileForm } from "@/lib/profile";

/** Postgres error code, whether postgres.js threw it directly or Drizzle wrapped it. */
function pgErrorCode(error: unknown): string | undefined {
  for (let e: unknown = error; e && typeof e === "object"; e = (e as { cause?: unknown }).cause) {
    const code = (e as { code?: unknown }).code;
    if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) return code;
  }
  return undefined;
}

const UNIQUE_VIOLATION = "23505";
const FOREIGN_KEY_VIOLATION = "23503";

export async function findProfile(userId: string): Promise<UserRow | undefined> {
  const [row] = await getDb().select().from(users).where(eq(users.id, userId)).limit(1);
  return row;
}

/**
 * The profile for a signed-in auth user, created on first sign-in. Returns undefined when the
 * auth user no longer exists (a deleted account whose old session cookie is still around).
 */
export async function getOrCreateProfile(authUser: {
  id: string;
  metadata?: Record<string, unknown>;
}): Promise<UserRow | undefined> {
  const existing = await findProfile(authUser.id);
  if (existing) return existing;
  try {
    await getDb()
      .insert(users)
      .values({ id: authUser.id, displayName: defaultDisplayName(authUser.metadata) })
      .onConflictDoNothing({ target: users.id });
  } catch (error) {
    if (pgErrorCode(error) === FOREIGN_KEY_VIOLATION) return undefined;
    throw error;
  }
  return findProfile(authUser.id);
}

export async function updateProfile(userId: string, form: ProfileForm): Promise<void> {
  await getDb()
    .update(users)
    .set({ displayName: form.displayName, homeZip: form.homeZip })
    .where(eq(users.id, userId));
}

/** True when a different account already verified this number. */
export async function phoneBelongsToSomeoneElse(userId: string, phoneE164: string) {
  const [row] = await getDb()
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.phoneE164, phoneE164), ne(users.id, userId)))
    .limit(1);
  return Boolean(row);
}

/**
 * Save a verified number. The unique index is the real guard: if two accounts verify the same
 * number at the same moment, only one save succeeds.
 */
export async function saveVerifiedPhone(
  userId: string,
  phoneE164: string,
  now = new Date(),
): Promise<{ ok: true } | { ok: false; reason: "taken" }> {
  try {
    await getDb()
      .update(users)
      .set({ phoneE164, phoneVerifiedAt: now })
      .where(eq(users.id, userId));
    return { ok: true };
  } catch (error) {
    if (pgErrorCode(error) === UNIQUE_VIOLATION) return { ok: false, reason: "taken" };
    throw error;
  }
}

/** Save a home zip only if the member hasn't set one (they share their location once). */
export async function setHomeZipIfEmpty(userId: string, zip: string): Promise<void> {
  await getDb()
    .update(users)
    .set({ homeZip: zip })
    .where(and(eq(users.id, userId), isNull(users.homeZip)));
}
