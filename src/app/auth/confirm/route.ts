import type { EmailOtpType } from "@supabase/supabase-js";
import { connection, type NextRequest } from "next/server";
import { getOrCreateProfile } from "@/server/accounts/profiles";
import { redirectToPath } from "@/server/auth/redirect";
import { takeReturnTo } from "@/server/auth/return-to";
import { createSupabaseServerClient } from "@/server/auth/supabase";

const EMAIL_TYPES = new Set<EmailOtpType>(["email", "magiclink", "signup"]);

/**
 * The sign-in email's link lands here (supabase/templates/sign-in.html). Verifying the token hash
 * works on any device, unlike a PKCE code that's tied to the browser that asked for the link.
 */
export async function GET(request: NextRequest) {
  await connection();
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type") as EmailOtpType | null;
  const failed = redirectToPath("/sign-in?error=link");
  if (!tokenHash || !type || !EMAIL_TYPES.has(type)) return failed;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
  if (error || !data.user) return failed;

  await getOrCreateProfile({ id: data.user.id, metadata: data.user.user_metadata });
  return redirectToPath(await takeReturnTo());
}
