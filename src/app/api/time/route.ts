import { connection } from "next/server";

/**
 * The server clock is the only clock. Clients fetch this to compute an offset and draw
 * countdowns from it, never from their own clock. `connection()` keeps the route dynamic
 * (with Cache Components, a GET handler that reads nothing request-specific gets prerendered).
 */
export async function GET() {
  await connection();
  return Response.json(
    { now: new Date().toISOString(), epochMs: Date.now() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
