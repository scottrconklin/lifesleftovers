import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { requireEnv } from "@/lib/env";

/**
 * Supabase is used for sign-in sessions only (Decisions log, Nov 15): all marketplace data goes
 * through Drizzle on the server. This client reads and refreshes the session cookies.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try {
            for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
          } catch {
            // Server Components can't write cookies. That's fine: the proxy refreshes sessions,
            // and Server Actions and Route Handlers (where sign-in happens) can write them.
          }
        },
      },
    },
  );
}

/** Admin client (secret key): bypasses RLS and manages users. Server-only; never log its output. */
export function createSupabaseAdminClient() {
  return createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SECRET_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
