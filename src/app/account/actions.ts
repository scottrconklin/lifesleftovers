"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { profileFormSchema } from "@/lib/profile";
import { updateProfile } from "@/server/accounts/profiles";
import { hasActiveAuctions } from "@/server/auctions/service";
import { getSessionUser } from "@/server/auth/session";
import { zipExists } from "@/server/geo/places";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@/server/auth/supabase";

export type ProfileState =
  | { status: "idle" }
  | { status: "saved"; savedAt: number }
  | { status: "error"; fieldErrors: Partial<Record<"displayName" | "homeZip", string>> };

export async function saveProfile(
  _previous: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  // Server Actions authorize themselves; never trust that the form came from a signed-in page.
  const user = await getSessionUser();
  if (!user) redirect("/sign-in?next=%2Faccount");

  const parsed = profileFormSchema.safeParse({
    displayName: formData.get("displayName") ?? "",
    homeZip: formData.get("homeZip") ?? "",
  });
  if (!parsed.success) {
    const fieldErrors: Partial<Record<"displayName" | "homeZip", string>> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if ((key === "displayName" || key === "homeZip") && !fieldErrors[key]) {
        fieldErrors[key] = issue.message;
      }
    }
    return { status: "error", fieldErrors };
  }
  if (parsed.data.homeZip && !(await zipExists(parsed.data.homeZip))) {
    return { status: "error", fieldErrors: { homeZip: "We don't recognize that zip code." } };
  }
  await updateProfile(user.id, parsed.data);
  return { status: "saved", savedAt: Date.now() };
}

export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut({ scope: "local" });
  redirect("/");
}

/**
 * Delete the account: removing the Supabase Auth user cascades to the profile (and its phone
 * number). Later milestones decide what happens to listings, bids and orders (order records are
 * kept as long as tax rules require; see the Decisions log).
 */
export async function deleteAccount(): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in?next=%2Faccount%2Fdelete");

  // Not while money or items are in play: winning an open auction, or selling one with bids.
  if (await hasActiveAuctions(user.id)) redirect("/account/delete?error=active");

  const admin = createSupabaseAdminClient();
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    console.error(`Account deletion failed: ${error.code ?? error.status ?? "unknown"}`);
    redirect("/account/delete?error=1");
  }

  // The session's tokens are now useless; clear its cookies on this device.
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
  const store = await cookies();
  for (const cookie of store.getAll()) {
    if (cookie.name.startsWith("sb-")) store.delete(cookie.name);
  }
  redirect("/account/deleted");
}
