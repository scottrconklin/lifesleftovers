import "server-only";
import { cacheLife } from "next/cache";

/**
 * Whether "Continue with Google" should show. Supabase Auth is the single switch: turn Google on
 * there (dashboard in production, supabase/config.toml locally) and the button appears; no app
 * variable to keep in sync. Cached for a few minutes; any failure hides the button.
 */
export async function googleSignInEnabled(): Promise<boolean> {
  "use cache";
  cacheLife("minutes");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return false;
  try {
    const response = await fetch(`${url}/auth/v1/settings`, {
      headers: { apikey: key },
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return false;
    const settings = (await response.json()) as { external?: { google?: unknown } };
    return settings.external?.google === true;
  } catch {
    return false;
  }
}
