import { afterAll, describe, expect, it } from "vitest";
import { closeDb, getSql } from "@/db/client";
import { chooseRadius } from "@/lib/radius";
import { assignZipsToMetros, ensureStarterMetros } from "./load";
import {
  findMetroBySlug,
  findZip,
  milesBetweenZips,
  milesFromZip,
  nearestZip,
  waitlistCount,
  zipExists,
} from "./places";
import { STARTER_METROS } from "./starter-metros";
import { joinWaitlist } from "./waitlist";

// Integration: needs `pnpm db:start && pnpm db:migrate && pnpm db:seed` (seed loads geography
// and opens Houston locally).
const TEST_EMAIL_DOMAIN = "@geo.db-test.local";

describe("geography", () => {
  afterAll(async () => {
    await getSql()`delete from public.waitlist_signups where email like ${"%" + TEST_EMAIL_DOMAIN}`;
    await closeDb();
  });

  it("loaded every US zip centroid", async () => {
    const [row] = await getSql()<{ n: number }[]>`select count(*)::int as n from public.zip_codes`;
    expect(row?.n).toBeGreaterThan(33_000);
    expect(await zipExists("77494")).toBe(true);
    expect(await zipExists("00000")).toBe(false);
  });

  it("has the metros with status, center, time zone and Closing Night schedule", async () => {
    const [houston] = await getSql()<
      {
        status: string;
        time_zone: string;
        closing_weekday: number;
        closing_starts_at: string;
        closing_ends_at: string;
        closing_slot_seconds: number;
        lat: number;
      }[]
    >`select status, time_zone, closing_weekday, closing_starts_at::text, closing_ends_at::text,
        closing_slot_seconds, extensions.st_y(center::extensions.geometry) as lat
      from public.metros where slug = 'houston'`;
    expect(houston).toMatchObject({
      status: "open", // opened by the local seed
      time_zone: "America/Chicago",
      closing_weekday: 0,
      closing_starts_at: "19:00:00",
      closing_ends_at: "21:00:00",
      closing_slot_seconds: 60,
    });
    expect(houston?.lat).toBeCloseTo(29.76, 2);
    expect((await findMetroBySlug("austin"))?.status).toBe("waitlist");
  });

  it("maps Houston zips to the starter areas", async () => {
    const cases: Array<[zip: string, area: string]> = [
      ["77494", "Katy"],
      ["77008", "Heights"],
      ["77006", "Montrose"],
      ["77002", "Downtown/EaDo"],
      ["77005", "Bellaire/West U"],
      ["77024", "Memorial"],
      ["77027", "Galleria"], // pinned: nearest-center would say Bellaire/West U
      ["77429", "Cypress"],
      ["77379", "Spring"],
      ["77380", "The Woodlands"],
      ["77339", "Kingwood/Humble"],
      ["77502", "Pasadena"],
      ["77058", "Clear Lake"],
      ["77573", "League City"],
      ["77581", "Pearland"],
      ["77471", "Sugar Land"], // pinned: Rosenberg
      ["77459", "Missouri City"],
    ];
    for (const [zip, area] of cases) {
      const place = await findZip(zip);
      expect(place?.metro?.slug, zip).toBe("houston");
      expect(place?.area?.name, zip).toBe(area);
    }
    const [{ n } = { n: 0 }] = await getSql()<{ n: number }[]>`
      select count(distinct area_id)::int as n from public.zip_codes z
      join public.metros m on m.id = z.metro_id where m.slug = 'houston'`;
    expect(n).toBe(17);
  });

  it("knows waitlist metros and places outside every metro", async () => {
    expect((await findZip("78701"))?.metro?.slug).toBe("austin");
    expect((await findZip("78701"))?.area).toBeNull();
    expect((await findZip("75201"))?.metro?.slug).toBe("dallas-fort-worth");
    expect((await findZip("76102"))?.metro?.slug).toBe("dallas-fort-worth"); // Fort Worth
    const galveston = await findZip("77550");
    expect(galveston?.zip).toBe("77550");
    expect(galveston?.metro).toBeNull();
    expect(await findZip("00000")).toBeNull();
    expect(await findZip("abcde")).toBeNull();
  });

  it("measures zip-to-zip distance with PostGIS", async () => {
    const miles = await milesBetweenZips("77002", "77494"); // downtown → Katy
    expect(miles).toBeGreaterThan(25);
    expect(miles).toBeLessThan(30);
    expect(await milesBetweenZips("77494", "77494")).toBe(0);
  });

  it("finds the nearest zip for 'Use my location', and nothing far from any zip", async () => {
    const katy = await nearestZip(29.7858, -95.8244);
    expect(katy?.area?.name).toBe("Katy");
    expect(await nearestZip(27.0, -90.0)).toBeNull(); // the Gulf of Mexico
    expect(await nearestZip(Number.NaN, 0)).toBeNull();
  });

  it("feeds real distances into auto-widen", async () => {
    // Stand-in for listings until M3: one "result" per zip in a list.
    const zips = ["77494", "77450", "77449", "77493", "77084", "77002", "77003", "77006", "77008"];
    const distances = await milesFromZip("77494", zips);
    expect(distances).toHaveLength(zips.length); // all within 50 mi
    const choice = chooseRadius(distances, 15);
    expect(choice.countAtRequested).toBeLessThan(12);
    expect(choice.widened).toBe(true);
    expect(choice.radiusMiles).toBe(50);
    expect(choice.count).toBe(zips.length);
    expect(await milesFromZip("77494", ["77494", "75201"])).toEqual([0]); // Dallas is beyond 50 mi
  });

  it("counts waitlist signups once per email and remembers host interest", async () => {
    const austin = (await findMetroBySlug("austin"))!;
    const before = await waitlistCount(austin.id);
    const email = `Neighbor${TEST_EMAIL_DOMAIN}`;
    await joinWaitlist({
      metroId: austin.id,
      zip: "78701",
      email,
      userId: null,
      wantsToHost: false,
    });
    await joinWaitlist({
      metroId: austin.id,
      zip: "78701",
      email: email.toLowerCase(),
      userId: null,
      wantsToHost: true,
    });
    await joinWaitlist({
      metroId: austin.id,
      zip: "78701",
      email,
      userId: null,
      wantsToHost: false,
    });
    expect(await waitlistCount(austin.id)).toBe(before + 1);
    const [row] = await getSql()<{ wants_to_host: boolean }[]>`
      select wants_to_host from public.waitlist_signups where email = ${email.toLowerCase()}`;
    expect(row?.wants_to_host).toBe(true);

    await joinWaitlist({ metroId: null, zip: "77550", email, userId: null, wantsToHost: false });
    await joinWaitlist({ metroId: null, zip: "77550", email, userId: null, wantsToHost: false });
    const [outside] = await getSql()<{ n: number }[]>`
      select count(*)::int as n from public.waitlist_signups
      where metro_id is null and zip = '77550' and email = ${email.toLowerCase()}`;
    expect(outside?.n).toBe(1);
  });

  it("re-running the loader never changes existing metros", async () => {
    await getSql()`update public.metros set name = 'Greater Houston (edited)' where slug = 'houston'`;
    try {
      expect(await ensureStarterMetros(getSql(), STARTER_METROS)).toEqual([]);
      await assignZipsToMetros(getSql());
      expect((await findMetroBySlug("houston"))?.name).toBe("Greater Houston (edited)");
      expect((await findZip("77494"))?.area?.name).toBe("Katy");
    } finally {
      await getSql()`update public.metros set name = 'Greater Houston' where slug = 'houston'`;
    }
  });

  it("keeps geography tables closed to browser roles (RLS on)", async () => {
    const rows = await getSql()<{ relname: string; rls: boolean }[]>`
      select relname, relrowsecurity as rls from pg_class
      where relname in ('metros', 'areas', 'zip_codes', 'waitlist_signups')
        and relnamespace = 'public'::regnamespace`;
    expect(rows).toHaveLength(4);
    for (const r of rows) expect(r.rls, r.relname).toBe(true);
  });
});
