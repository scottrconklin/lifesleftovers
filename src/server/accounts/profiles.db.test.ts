import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, getSql } from "@/db/client";
import {
  findProfile,
  getOrCreateProfile,
  phoneBelongsToSomeoneElse,
  saveVerifiedPhone,
  updateProfile,
} from "./profiles";

// Integration: needs `pnpm db:start && pnpm db:migrate`. Users are created straight in auth.users
// (as Supabase Auth would) with a test-only email domain, and removed afterwards.
const DOMAIN = "@profiles.db-test.local";

async function createAuthUser(metadata: Record<string, unknown> = {}): Promise<string> {
  const id = randomUUID();
  await getSql()`
    insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
    values (${id}, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            ${id + DOMAIN}, ${JSON.stringify(metadata)}::text::jsonb, now(), now())`;
  return id;
}

/** A random fictional Houston number, so reruns don't collide with leftovers. */
function randomPhone(): string {
  return `+1713555${String(Math.floor(Math.random() * 10_000)).padStart(4, "0")}`;
}

describe("profiles (users table)", () => {
  beforeAll(async () => {
    await getSql()`delete from auth.users where email like ${"%" + DOMAIN}`;
  });
  afterAll(async () => {
    await getSql()`delete from auth.users where email like ${"%" + DOMAIN}`;
    await closeDb();
  });

  it("creates the profile on first sign-in, once", async () => {
    const id = await createAuthUser({ given_name: "Scott", family_name: "Conklin" });
    const first = await getOrCreateProfile({
      id,
      metadata: { given_name: "Scott", family_name: "Conklin" },
    });
    const second = await getOrCreateProfile({ id, metadata: { given_name: "Changed" } });
    expect(first?.displayName).toBe("Scott C.");
    expect(second?.displayName).toBe("Scott C.");
    expect(first?.phoneVerifiedAt).toBeNull();
  });

  it("returns nothing for a deleted auth user instead of failing", async () => {
    expect(await getOrCreateProfile({ id: randomUUID() })).toBeUndefined();
  });

  it("saves the profile form", async () => {
    const id = await createAuthUser();
    await getOrCreateProfile({ id });
    await updateProfile(id, { displayName: "Ana L.", homeZip: "77494" });
    const row = await findProfile(id);
    expect(row).toMatchObject({ displayName: "Ana L.", homeZip: "77494" });
  });

  it("allows one account per phone number", async () => {
    const phone = randomPhone();
    const a = await createAuthUser();
    const b = await createAuthUser();
    await getOrCreateProfile({ id: a });
    await getOrCreateProfile({ id: b });

    expect(await saveVerifiedPhone(a, phone)).toEqual({ ok: true });
    expect(await phoneBelongsToSomeoneElse(b, phone)).toBe(true);
    expect(await phoneBelongsToSomeoneElse(a, phone)).toBe(false);
    expect(await saveVerifiedPhone(b, phone)).toEqual({ ok: false, reason: "taken" });
    expect((await findProfile(b))?.phoneE164).toBeNull();
  });

  it("lets only one of two simultaneous verifications of a number win", async () => {
    const phone = randomPhone();
    const ids = await Promise.all([createAuthUser(), createAuthUser()]);
    await Promise.all(ids.map((id) => getOrCreateProfile({ id })));
    const results = await Promise.all(ids.map((id) => saveVerifiedPhone(id, phone)));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
  });

  it("deletes the profile and frees the phone number when the account is deleted", async () => {
    const phone = randomPhone();
    const id = await createAuthUser();
    await getOrCreateProfile({ id });
    await saveVerifiedPhone(id, phone);
    await getSql()`delete from auth.users where id = ${id}`;
    expect(await findProfile(id)).toBeUndefined();

    const other = await createAuthUser();
    await getOrCreateProfile({ id: other });
    expect(await saveVerifiedPhone(other, phone)).toEqual({ ok: true });
  });

  it("rejects malformed zips and phone numbers at the database too", async () => {
    const id = await createAuthUser();
    await getOrCreateProfile({ id });
    await expect(
      getSql()`update public.users set home_zip = '7749' where id = ${id}`,
    ).rejects.toThrow(/users_home_zip_format/);
    await expect(
      getSql()`update public.users set phone_e164 = '7135550123', phone_verified_at = now() where id = ${id}`,
    ).rejects.toThrow(/users_phone_e164_format/);
    await expect(
      getSql()`update public.users set phone_e164 = '+17135550123' where id = ${id}`,
    ).rejects.toThrow(/users_phone_verified_together/);
  });

  it("keeps the table closed to browser roles (RLS on, no policies)", async () => {
    const id = await createAuthUser();
    await getOrCreateProfile({ id });
    const [table] = await getSql()<{ rls: boolean }[]>`
      select relrowsecurity as rls from pg_class where oid = 'public.users'::regclass`;
    expect(table?.rls).toBe(true);

    for (const role of ["anon", "authenticated"]) {
      const rows = await getSql().begin(async (tx) => {
        await tx.unsafe(`set local role ${role}`);
        return tx`select id from public.users`.catch(() => []);
      });
      expect(rows, role).toHaveLength(0);
    }
  });
});
