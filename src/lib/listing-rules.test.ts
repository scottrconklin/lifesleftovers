import { describe, expect, it } from "vitest";
import { pickupDayLabel } from "./listing-options";
import {
  editPermissions,
  listingFormSchema,
  maxPhotos,
  needsAuthenticityProof,
  parseDollarsToCents,
  parsePickupWindows,
} from "./listing-rules";

const base = {
  title: "Vintage red metal toolbox",
  category: "tools-building",
  condition: "good",
  description: "",
  whyItsHere: "Grandpa's toolbox.",
  isLot: false,
  isFree: false,
  lotItemCount: null,
  lotContents: "",
  sizeHint: null,
  startChoice: "default",
  customStart: "",
  isBrandName: false,
  authenticityConfirmed: false,
  pickupZip: "77494",
  pickupWindows: [{ dayOffset: 1, block: "evening" }],
  closingNightDate: "2026-11-29",
  unsoldAction: "relist_once",
} as const;

function errors(input: object) {
  const r = listingFormSchema.safeParse(input);
  return r.success
    ? {}
    : Object.fromEntries(r.error.issues.map((i) => [i.path.join("."), i.message]));
}

describe("parseDollarsToCents", () => {
  it.each([
    ["15", 1500],
    ["$15", 1500],
    ["15.5", 1550],
    ["15.50", 1550],
    ["1,250.00", 125000],
    ["0.99", 99],
  ])("%s → %i cents", (input, cents) => {
    expect(parseDollarsToCents(input)).toBe(cents);
  });

  it.each(["", "abc", "15.555", "-5", "1e3", "$"])("refuses %j", (input) => {
    expect(parseDollarsToCents(input)).toBeNull();
  });
});

describe("listing form", () => {
  it("defaults to a $1 visible start", () => {
    expect(listingFormSchema.parse(base).startPriceCents).toBe(100);
  });

  it("takes a custom visible start of $1 or more", () => {
    expect(
      listingFormSchema.parse({ ...base, startChoice: "custom", customStart: "15" })
        .startPriceCents,
    ).toBe(1500);
    expect(errors({ ...base, startChoice: "custom", customStart: "0.50" }).customStart).toMatch(
      /\$1 or more/,
    );
    expect(errors({ ...base, startChoice: "custom", customStart: "100000" }).customStart).toMatch(
      /extra zero/,
    );
  });

  it("makes free items $0 whatever else was chosen, and asks for a size hint", () => {
    expect(errors({ ...base, isFree: true }).sizeHint).toMatch(/trunk/);
    const free = listingFormSchema.parse({
      ...base,
      isFree: true,
      sizeHint: "trunk",
      startChoice: "custom",
      customStart: "20",
    });
    expect(free.startPriceCents).toBe(0);
  });

  it("free items can't 'drop to free' when unsold", () => {
    const free = listingFormSchema.parse({
      ...base,
      isFree: true,
      sizeHint: "trunk",
      unsoldAction: "drop_to_free",
    });
    expect(free.unsoldAction).toBe("relist_once");
  });

  it("lots need an item count, what's included and a size hint", () => {
    const e = errors({ ...base, isLot: true });
    expect(e.lotItemCount).toMatch(/how many/);
    expect(e.lotContents).toMatch(/included/);
    expect(e.sizeHint).toMatch(/trunk/);
    const lot = listingFormSchema.parse({
      ...base,
      isLot: true,
      lotItemCount: 12,
      lotContents: "3 bags of cheer and lacrosse uniforms",
      sizeHint: "truck",
    });
    expect(lot).toMatchObject({ isLot: true, lotItemCount: 12, startPriceCents: 100 });
  });

  it("allows a free lot", () => {
    const freeLot = listingFormSchema.parse({
      ...base,
      isLot: true,
      isFree: true,
      lotItemCount: 5,
      lotContents: "Flashing, shingles, nails",
      sizeHint: "truck",
    });
    expect(freeLot.startPriceCents).toBe(0);
  });

  it("drops lot fields from single items", () => {
    const item = listingFormSchema.parse({
      ...base,
      lotItemCount: 4,
      lotContents: "x",
      sizeHint: "truck",
    });
    expect(item).toMatchObject({ lotItemCount: null, lotContents: null, sizeHint: null });
  });

  it("needs a title, category, condition, zip and a pickup window", () => {
    const e = errors({
      ...base,
      title: " ",
      category: "",
      condition: "",
      pickupZip: "7749",
      pickupWindows: [],
    });
    expect(Object.keys(e).sort()).toEqual([
      "category",
      "condition",
      "pickupWindows",
      "pickupZip",
      "title",
    ]);
  });
});

describe("pickup windows", () => {
  it("parses, de-duplicates and sorts form values", () => {
    expect(
      parsePickupWindows(["6:morning", "1:evening", "1:evening", "9:evening", "1:midnight"]),
    ).toEqual([
      { dayOffset: 1, block: "evening" },
      { dayOffset: 6, block: "morning" },
    ]);
  });

  it("labels days relative to the metro's Closing Night", () => {
    expect(pickupDayLabel(0, 1)).toBe("Mon"); // Sunday Closing Night
    expect(pickupDayLabel(0, 6)).toBe("Sat");
    expect(pickupDayLabel(6, 1)).toBe("Sun"); // a Saturday metro
  });
});

describe("photo limits and brand-name proof", () => {
  it("allows 8 photos, 12 for lots", () => {
    expect(maxPhotos({ isLot: false, isFree: false })).toBe(8);
    expect(maxPhotos({ isLot: true, isFree: false })).toBe(12);
    expect(maxPhotos({ isLot: false, isFree: true })).toBe(8);
  });

  it("asks for proof on brand-name items at $50 or more, by start or AI suggestion", () => {
    const item = {
      isBrandName: true,
      isFree: false,
      startPriceCents: 100,
      suggestedStartCents: null,
    };
    expect(needsAuthenticityProof(item)).toBe(false);
    expect(needsAuthenticityProof({ ...item, startPriceCents: 5000 })).toBe(true);
    expect(needsAuthenticityProof({ ...item, suggestedStartCents: 8000 })).toBe(true);
    expect(needsAuthenticityProof({ ...item, isBrandName: false, startPriceCents: 9000 })).toBe(
      false,
    );
    expect(needsAuthenticityProof({ ...item, isFree: true, suggestedStartCents: 9000 })).toBe(
      false,
    );
  });
});

describe("edit rules", () => {
  it("edits anything and cancels before the first bid", () => {
    expect(editPermissions({ status: "live", bidCount: 0 })).toEqual({
      editEverything: true,
      addPhotos: true,
      addNotes: false,
      cancel: true,
    });
  });

  it("only adds photos or notes after the first bid, and can't cancel", () => {
    expect(editPermissions({ status: "live", bidCount: 1 })).toEqual({
      editEverything: false,
      addPhotos: true,
      addNotes: true,
      cancel: false,
    });
  });

  it("freezes cancelled and removed listings", () => {
    for (const status of ["cancelled", "removed"] as const) {
      expect(Object.values(editPermissions({ status, bidCount: 0 }))).toEqual([
        false,
        false,
        false,
        false,
      ]);
    }
  });

  it("drafts are edited, not cancelled", () => {
    expect(editPermissions({ status: "draft", bidCount: 0 }).cancel).toBe(false);
  });
});
