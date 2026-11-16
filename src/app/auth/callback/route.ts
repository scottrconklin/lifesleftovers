import { connection, type NextRequest } from "next/server";
import { getOrCreateProfile } from "@/server/accounts/profiles";
import { redirectToPath } from "@/server/auth/redirect";
import { takeReturnTo } from "@/server/auth/return-to";
import { createSupabaseServerClient } from "@/server/auth/supabase";

/** Google sign-in returns here with a one-time code (PKCE), exchanged for a session. */
export async function GET(request: NextRequest) {
  await connection();
  const code = request.nextUrl.searchParams.get("code");
  const failed = redirectToPath("/sign-in?error=google");
  if (!code) return failed;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) return failed;

  await getOrCreateProfile({ id: data.user.id, metadata: data.user.user_metadata });
  return redirectToPath(await takeReturnTo());
}
