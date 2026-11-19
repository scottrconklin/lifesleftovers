/**
 * Fake local data. Fixed ids and emails so re-seeding is idempotent. Emails use a reserved test
 * domain; phone numbers use the fictional 555-01xx range.
 */
export const SEED_EMAIL_DOMAIN = "@seed.lifesleftovers.test";

export type SeedUser = {
  id: string;
  email: string;
  displayName: string;
  homeZip: string;
  phone: string;
};

const PEOPLE: Array<[name: string, zip: string]> = [
  ["Scott C.", "77494"], // Katy
  ["Ana L.", "77008"], // Heights
  ["Marcus J.", "77006"], // Montrose
  ["Priya S.", "77005"], // West U
  ["Dee W.", "77024"], // Memorial
  ["Tom B.", "77056"], // Galleria
  ["Lupe R.", "77450"], // Katy
  ["Kevin N.", "77429"], // Cypress
  ["Rachel M.", "77379"], // Spring
  ["Jordan P.", "77380"], // The Woodlands
  ["Gloria H.", "77339"], // Kingwood
  ["Hector V.", "77502"], // Pasadena
  ["Beth A.", "77058"], // Clear Lake
  ["Sam O.", "77573"], // League City
  ["Nia T.", "77581"], // Pearland
  ["Wei Z.", "77479"], // Sugar Land
  ["Carla D.", "77459"], // Missouri City
  ["Ray K.", "77003"], // EaDo
  ["Mo F.", "77401"], // Bellaire
  ["June E.", "77433"], // Cypress
];

export const SEED_USERS: SeedUser[] = PEOPLE.map(([displayName, homeZip], i) => {
  const n = String(i + 1).padStart(2, "0");
  return {
    id: `00000000-0000-4000-8000-0000000001${n}`,
    email: `seller${n}${SEED_EMAIL_DOMAIN}`,
    displayName,
    homeZip,
    phone: `+1713555${String(100 + i + 1).padStart(4, "0")}`,
  };
});

/** Fake "Tell me when it opens" signups, so waitlist screens have numbers to show locally. */
export const SEED_WAITLIST: Array<{ metroSlug: string; count: number }> = [
  { metroSlug: "austin", count: 37 },
  { metroSlug: "san-antonio", count: 12 },
  { metroSlug: "dallas-fort-worth", count: 5 },
];
