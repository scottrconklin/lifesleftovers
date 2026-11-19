import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  smallint,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { geographyPoint } from "../geography";
import { users } from "./users";

/**
 * Geography is admin-defined (SPEC "Cold start"): metros are the launch unit, areas are friendly
 * labels, and every US zip maps to at most one metro and area. Users only ever share a zip.
 * RLS is on with no policies everywhere: only the server reads these tables.
 */

/** Waitlist (collecting signups) → Seeding (Founding Host listing; not public) → Open. */
export const metroStatus = pgEnum("metro_status", ["waitlist", "seeding", "open"]);
export type MetroStatus = (typeof metroStatus.enumValues)[number];

export const metros = pgTable(
  "metros",
  {
    id: uuid().primaryKey().defaultRandom(),
    slug: text().notNull().unique(),
    /** "Greater Houston" */
    name: text().notNull(),
    /** "Houston", used in copy: "Houston isn't open yet". */
    shortName: text().notNull(),
    status: metroStatus().notNull().default("waitlist"),
    center: geographyPoint().notNull(),
    /** Zips whose centroid is within this distance of the center belong to the metro. */
    serviceRadiusMiles: integer().notNull(),
    /** IANA zone; Closing Night times and every displayed time use it. */
    timeZone: text().notNull(),
    /** 0 = Sunday … 6 = Saturday, in the metro's time zone. */
    closingWeekday: smallint().notNull(),
    closingStartsAt: time().notNull(),
    closingEndsAt: time().notNull(),
    /** One item closes per slot ("one item a minute"). */
    closingSlotSeconds: integer().notNull(),
    /** A waitlist metro opens at about this many live listings. */
    listingsToOpen: integer().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    check("metros_closing_weekday", sql`${t.closingWeekday} between 0 and 6`),
    check("metros_closing_window", sql`${t.closingEndsAt} > ${t.closingStartsAt}`),
    check(
      "metros_positive_numbers",
      sql`${t.serviceRadiusMiles} > 0 and ${t.closingSlotSeconds} > 0 and ${t.listingsToOpen} >= 0`,
    ),
  ],
).enableRLS();

export const areas = pgTable(
  "areas",
  {
    id: uuid().primaryKey().defaultRandom(),
    metroId: uuid()
      .notNull()
      .references(() => metros.id, { onDelete: "cascade" }),
    slug: text().notNull(),
    /** "Katy", shown on cards as "8 mi · Katy". */
    name: text().notNull(),
    /** Zips not listed below map to the nearest area center within their metro. */
    center: geographyPoint().notNull(),
    /** Zips that always belong to this area, whatever center is nearest. */
    zips: text()
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("areas_metro_slug").on(t.metroId, t.slug)],
).enableRLS();

/** US Census ZCTA centroids (data/geo), plus which metro and area each belongs to. */
export const zipCodes = pgTable(
  "zip_codes",
  {
    zip: text().primaryKey(),
    location: geographyPoint().notNull(),
    metroId: uuid().references(() => metros.id, { onDelete: "set null" }),
    areaId: uuid().references(() => areas.id, { onDelete: "set null" }),
  },
  (t) => [
    check("zip_codes_zip_format", sql`${t.zip} ~ '^[0-9]{5}$'`),
    index("zip_codes_location_idx").using("gist", t.location),
    index("zip_codes_metro_idx").on(t.metroId),
  ],
).enableRLS();

/**
 * "Tell me when it opens" and Founding Host interest, for a metro, or for a zip outside every
 * metro. Emails are personal data: never log them.
 */
export const waitlistSignups = pgTable(
  "waitlist_signups",
  {
    id: uuid().primaryKey().defaultRandom(),
    metroId: uuid().references(() => metros.id, { onDelete: "cascade" }),
    zip: text(),
    /** Stored lowercased. */
    email: text().notNull(),
    userId: uuid().references(() => users.id, { onDelete: "cascade" }),
    wantsToHost: boolean().notNull().default(false),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("waitlist_has_place", sql`${t.metroId} is not null or ${t.zip} is not null`),
    uniqueIndex("waitlist_metro_email")
      .on(t.metroId, t.email)
      .where(sql`${t.metroId} is not null`),
    uniqueIndex("waitlist_zip_email")
      .on(t.zip, t.email)
      .where(sql`${t.metroId} is null`),
  ],
).enableRLS();

export type MetroRow = typeof metros.$inferSelect;
export type AreaRow = typeof areas.$inferSelect;
