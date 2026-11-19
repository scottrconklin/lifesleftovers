import { sql } from "drizzle-orm";
import { check, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { authUsers } from "drizzle-orm/supabase";

/**
 * One profile per Supabase Auth user. Sign-in identity (email, Google) lives in `auth.users`;
 * this table holds what the marketplace needs. Deleting the auth user deletes the profile.
 *
 * RLS is on with no policies: only the server (Drizzle, as the table owner) reads or writes it.
 */
export const users = pgTable(
  "users",
  {
    id: uuid()
      .primaryKey()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    /** Public name. Null until the user sets one (Google sign-ins get a default). */
    displayName: text(),
    /** 5-digit US zip; checked against metro areas in M2. */
    homeZip: text(),
    /** Verified phone in E.164 (+17135550123). One account per number. Never log it. */
    phoneE164: text("phone_e164").unique("users_phone_e164_unique"),
    phoneVerifiedAt: timestamp({ withTimezone: true }),
    /** Stripe Customer ("cus_…"), created when the member first saves a card. */
    stripeCustomerId: text().unique(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    check("users_home_zip_format", sql`${t.homeZip} ~ '^[0-9]{5}$'`),
    check("users_phone_e164_format", sql`${t.phoneE164} ~ '^\\+[1-9][0-9]{7,14}$'`),
    check(
      "users_phone_verified_together",
      sql`(${t.phoneE164} is null) = (${t.phoneVerifiedAt} is null)`,
    ),
  ],
).enableRLS();

export type UserRow = typeof users.$inferSelect;
