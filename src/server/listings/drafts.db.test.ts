import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { closeDb, getSql } from "@/db/client";
import { addPhoto, draftForNewListing, sellerListings } from "./repo";

const DOMAIN = "@drafts.db-test.local";

describe("drafts", () => {
  afterAll(async () => {
    await getSql()`delete from auth.users where email like ${"%" + DOMAIN}`;
    await closeDb();
  });

  it("reuses an empty draft instead of leaving orphans, and hides empty drafts", async () => {
    const id = randomUUID();
    await getSql()`
      insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
      values (${id}, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        ${id + DOMAIN}, now(), now())`;
    await getSql()`insert into public.users (id) values (${id})`;

    const first = await draftForNewListing(id);
    expect(await draftForNewListing(id)).toBe(first); // the page was lost: same draft again
    expect(await sellerListings(id)).toEqual([]); // nothing to show yet

    await addPhoto(first, {
      id: randomUUID(),
      kind: "photo",
      storageKey: "p/test.jpg",
      width: 10,
      height: 10,
      bytes: 1,
    });
    expect((await sellerListings(id)).map((l) => l.id)).toEqual([first]);
    expect(await draftForNewListing(id)).not.toBe(first); // it has a photo now: start a new one
  });
});
