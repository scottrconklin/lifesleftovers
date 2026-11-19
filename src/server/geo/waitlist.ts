import "server-only";
import { getSql } from "@/db/client";

/**
 * "Tell me when it opens" and Founding Host interest. Signing up twice is harmless: the same
 * email in the same place is one row, and host interest only ever turns on. Never log emails.
 */
export async function joinWaitlist(input: {
  metroId: string | null;
  /** Required when there's no metro (a zip outside every metro). */
  zip: string | null;
  email: string;
  userId: string | null;
  wantsToHost: boolean;
}): Promise<void> {
  const email = input.email.trim().toLowerCase();
  const sql = getSql();
  if (input.metroId) {
    await sql`
      insert into public.waitlist_signups (metro_id, zip, email, user_id, wants_to_host)
      values (${input.metroId}, ${input.zip}, ${email}, ${input.userId}, ${input.wantsToHost})
      on conflict (metro_id, email) where metro_id is not null
      do update set wants_to_host = public.waitlist_signups.wants_to_host or excluded.wants_to_host,
        user_id = coalesce(public.waitlist_signups.user_id, excluded.user_id)`;
    return;
  }
  if (!input.zip) throw new Error("A waitlist signup needs a metro or a zip");
  await sql`
    insert into public.waitlist_signups (metro_id, zip, email, user_id, wants_to_host)
    values (null, ${input.zip}, ${email}, ${input.userId}, ${input.wantsToHost})
    on conflict (zip, email) where metro_id is null
    do update set wants_to_host = public.waitlist_signups.wants_to_host or excluded.wants_to_host,
      user_id = coalesce(public.waitlist_signups.user_id, excluded.user_id)`;
}
