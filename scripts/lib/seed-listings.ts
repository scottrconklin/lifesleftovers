/**
 * ~200 local listings across the seeded sellers: mostly $1 starts, some custom starts, lots and
 * free items, spread over every Houston area so the radius search has something to find.
 * Photos are generated placeholders (a colored square with the item's name).
 */
import type { CategorySlug, ConditionSlug } from "@/lib/listing-options";

type Base = {
  title: string;
  category: CategorySlug;
  condition: ConditionSlug;
  why: string;
  startDollars?: number;
  lot?: { count: number; contents: string; size: "trunk" | "truck" };
  free?: { size: "trunk" | "truck" };
};

export const CATALOG: Base[] = [
  {
    title: "Vintage red metal toolbox",
    category: "tools-building",
    condition: "good",
    why: "Grandpa's toolbox. He'd want it used, not sitting in my garage.",
  },
  {
    title: "KitchenAid stand mixer, white",
    category: "home-kitchen",
    condition: "good",
    why: "Upgraded to a bigger one. This still works great.",
    startDollars: 40,
  },
  {
    title: "Box of leftover floor tile (about 30 sq ft)",
    category: "tools-building",
    condition: "new",
    why: "Bought too much for the bathroom redo.",
  },
  {
    title: "Kids' bike with training wheels, 16 inch",
    category: "kids-baby",
    condition: "fair",
    why: "Outgrown in one summer.",
  },
  {
    title: "Set of 6 wine glasses",
    category: "home-kitchen",
    condition: "like_new",
    why: "Wedding gift we never used.",
  },
  {
    title: "Patio umbrella, 9 ft, navy",
    category: "yard-garden",
    condition: "good",
    why: "Moved to a place with a covered porch.",
  },
  {
    title: "Cheer and lacrosse uniforms",
    category: "costumes-uniforms",
    condition: "good",
    why: "My daughter left for college. Somebody's kid should wear these.",
    lot: {
      count: 30,
      contents: "3 bags of cheer and lacrosse uniforms, sizes S to L",
      size: "trunk",
    },
  },
  {
    title: "Half a roll of metal flashing",
    category: "free-oddities",
    condition: "new",
    why: "Leftover from the roof repair.",
    free: { size: "trunk" },
  },
  {
    title: "Oak bookshelf, 5 shelves",
    category: "furniture",
    condition: "good",
    why: "Too big for the new apartment.",
  },
  {
    title: "Board game bundle (Catan, Ticket to Ride, Codenames)",
    category: "toys-games",
    condition: "like_new",
    why: "Game night moved to a friend's house.",
    lot: {
      count: 3,
      contents: "Catan, Ticket to Ride, Codenames. All pieces counted.",
      size: "trunk",
    },
  },
  {
    title: "Lava lamp, purple",
    category: "collectibles-kitsch",
    condition: "good",
    why: "It's time.",
  },
  {
    title: "Cordless drill, 18V, two batteries",
    category: "tools-building",
    condition: "good",
    why: "Got a new kit for my birthday.",
    startDollars: 15,
  },
  {
    title: "Garden hose reel cart",
    category: "yard-garden",
    condition: "fair",
    why: "Switched to a wall mount.",
  },
  {
    title: "Bag of assorted yarn",
    category: "crafts-hobbies",
    condition: "new",
    why: "Aunt's craft room cleanout.",
    lot: { count: 40, contents: "About 40 skeins, mostly worsted weight", size: "trunk" },
  },
  {
    title: "Bluetooth speaker",
    category: "electronics",
    condition: "good",
    why: "Duplicate gift.",
  },
  {
    title: "Rattan accent chair",
    category: "furniture",
    condition: "good",
    why: "Redecorating the sunroom.",
  },
  {
    title: "Moving boxes, flattened",
    category: "free-oddities",
    condition: "good",
    why: "We're done moving, finally.",
    free: { size: "trunk" },
  },
  {
    title: "Women's leather handbag, brown",
    category: "clothing-shoes-handbags",
    condition: "like_new",
    why: "Closet purge.",
  },
  {
    title: "Halloween costume bin",
    category: "costumes-uniforms",
    condition: "good",
    why: "Kids decided costumes are 'for babies' now.",
    lot: {
      count: 12,
      contents: "Pirate, dinosaur, princess, ninja and more, kids' sizes 4 to 8",
      size: "trunk",
    },
  },
  {
    title: "Cast iron skillet, 12 inch",
    category: "home-kitchen",
    condition: "good",
    why: "I have three. Nobody needs three.",
  },
  {
    title: "Tennis rackets, pair",
    category: "sports-outdoors",
    condition: "fair",
    why: "We tried. We really did.",
  },
  {
    title: "Leftover pavers",
    category: "yard-garden",
    condition: "new",
    why: "Patio's done; these are the extras.",
    lot: { count: 45, contents: "About 45 gray concrete pavers", size: "truck" },
  },
  {
    title: "Vintage Pyrex mixing bowls",
    category: "collectibles-kitsch",
    condition: "good",
    why: "Mom's. My sister and I each kept one set.",
    startDollars: 20,
  },
  {
    title: "Baby swing",
    category: "kids-baby",
    condition: "good",
    why: "Our youngest is two now.",
  },
  {
    title: "Desk lamp, brass",
    category: "home-kitchen",
    condition: "good",
    why: "Office went fully remote, then fully closed.",
  },
  {
    title: "Scrap lumber, mostly 2x4s",
    category: "free-oddities",
    condition: "fair",
    why: "Leftover from the shed build.",
    free: { size: "truck" },
  },
  {
    title: "Old Nintendo games",
    category: "toys-games",
    condition: "good",
    why: "Found them in the attic.",
    lot: { count: 8, contents: "8 cartridges, untested", size: "trunk" },
  },
  {
    title: "Fishing rod and tackle box",
    category: "sports-outdoors",
    condition: "good",
    why: "Dad's. I don't fish.",
  },
  {
    title: "Dining chairs, set of 4",
    category: "furniture",
    condition: "fair",
    why: "New table came with chairs.",
  },
  {
    title: "Picture frames, assorted",
    category: "home-kitchen",
    condition: "good",
    why: "Went digital.",
    lot: { count: 15, contents: "15 frames, sizes 4x6 to 11x14", size: "trunk" },
  },
];

/** Placeholder photo colors, from the brand's warm palette. */
export const PHOTO_COLORS = ["#E9DFCE", "#F5B82E", "#D94B35", "#477A59", "#1B385B", "#C9B79C"];

export function seedListingId(i: number): string {
  return `00000000-0000-4000-9000-${String(i + 1).padStart(12, "0")}`;
}

export function seedPhotoId(i: number, n: number): string {
  return `00000000-0000-4000-a000-${String(i + 1).padStart(9, "0")}${String(n).padStart(3, "0")}`;
}

export const SEED_LISTING_COUNT = 200;
