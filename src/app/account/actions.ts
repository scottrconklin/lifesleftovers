"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { profileFormSchema } from "@/lib/profile";
import { updateProfile } from "@/server/accounts/profiles";
import { getSessionUser } from "@/server/auth/session";
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
