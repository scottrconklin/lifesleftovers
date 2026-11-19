import { marketplaceConfig } from "@/config/marketplace";
import type { MetroStatus } from "@/db/schema";

/**
 * The starter geography `pnpm db:geo` creates when a metro doesn't exist yet. After that the
 * database is the source of truth (admin-managed in M9); re-running never overwrites a metro.
 *
 * Areas are defined by a few anchor zips that are unmistakably in them; the area's center is
 * the middle of those anchors, a few extra zips are pinned where nearest-center gets them wrong,
 * and every other zip in the metro maps to the nearest center.
 * Sellers never pick an area (SPEC "Location").
 */
export type StarterArea = {
  slug: string;
  name: string;
  /** Set the area's center; also always belong to the area. */
  anchorZips: string[];
  /** Always belong to the area without moving its center (fixes nearest-center misses). */
  extraZips?: string[];
};

export type StarterMetro = {
  slug: string;
  name: string;
  shortName: string;
  /** Status when first created. Houston starts "seeding" (not public) until launch. */
  status: MetroStatus;
  center: { lat: number; lng: number };
  serviceRadiusMiles: number;
  areas: StarterArea[];
};

export const STARTER_METROS: StarterMetro[] = [
  {
    slug: "houston",
    name: "Greater Houston",
    shortName: "Houston",
    status: "seeding",
    center: { lat: 29.7604, lng: -95.3698 }, // downtown
    // Reaches The Woodlands, Conroe, Katy, Fulshear, Baytown and League City; not Galveston.
    serviceRadiusMiles: 40,
    areas: [
      { slug: "heights", name: "Heights", anchorZips: ["77008"] },
      { slug: "montrose", name: "Montrose", anchorZips: ["77006"] },
      { slug: "downtown-eado", name: "Downtown/EaDo", anchorZips: ["77002", "77003"] },
      { slug: "bellaire-west-u", name: "Bellaire/West U", anchorZips: ["77401", "77005"] },
      { slug: "memorial", name: "Memorial", anchorZips: ["77024"] },
      {
        slug: "galleria",
        name: "Galleria",
        anchorZips: ["77056", "77057"],
        extraZips: ["77027"], // River Oaks / Highland Village
      },
      { slug: "katy", name: "Katy", anchorZips: ["77494", "77450"] },
      { slug: "cypress", name: "Cypress", anchorZips: ["77429", "77433"] },
      { slug: "spring", name: "Spring", anchorZips: ["77379", "77373"] },
      { slug: "the-woodlands", name: "The Woodlands", anchorZips: ["77380", "77381", "77382"] },
      { slug: "kingwood-humble", name: "Kingwood/Humble", anchorZips: ["77339", "77345", "77338"] },
      { slug: "pasadena", name: "Pasadena", anchorZips: ["77502", "77506"] },
      { slug: "clear-lake", name: "Clear Lake", anchorZips: ["77058", "77062"] },
      { slug: "league-city", name: "League City", anchorZips: ["77573"] },
      { slug: "pearland", name: "Pearland", anchorZips: ["77581", "77584"] },
      {
        slug: "sugar-land",
        name: "Sugar Land",
        anchorZips: ["77478", "77479"],
        extraZips: ["77469", "77471", "77477"], // Richmond, Rosenberg, Stafford
      },
      { slug: "missouri-city", name: "Missouri City", anchorZips: ["77459", "77489"] },
    ],
  },
  // Waitlist cities: no areas until a Founding Host opens them.
  {
    slug: "austin",
    name: "Austin",
    shortName: "Austin",
    status: "waitlist",
    center: { lat: 30.2672, lng: -97.7431 },
    serviceRadiusMiles: 30,
    areas: [],
  },
  {
    slug: "san-antonio",
    name: "San Antonio",
    shortName: "San Antonio",
    status: "waitlist",
    center: { lat: 29.4241, lng: -98.4936 },
    serviceRadiusMiles: 30,
    areas: [],
  },
  {
    slug: "dallas-fort-worth",
    name: "Dallas–Fort Worth",
    shortName: "Dallas–Fort Worth",
    status: "waitlist",
    center: { lat: 32.7767, lng: -96.797 }, // downtown Dallas
    serviceRadiusMiles: 45, // reaches Fort Worth (~31 mi) and the suburbs around both
    areas: [],
  },
];

/** Closing Night schedule every new metro starts with (from the config module). */
export const DEFAULT_SCHEDULE = {
  timeZone: marketplaceConfig.closingNight.defaultTimeZone,
  closingWeekday: marketplaceConfig.closingNight.defaultWeekday,
  closingStartsAt: `${marketplaceConfig.closingNight.defaultStartLocalTime}:00`,
  closingEndsAt: `${marketplaceConfig.closingNight.defaultEndLocalTime}:00`,
  closingSlotSeconds: marketplaceConfig.closingNight.slotIntervalSeconds,
  listingsToOpen: marketplaceConfig.metros.listingsToOpen,
};
