"use server";

import { refresh } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { getViewer } from "@/server/auth/session";
import { findMetroBySlug, findZip } from "@/server/geo/places";
import { joinWaitlist } from "@/server/geo/waitlist";
import { verifyTurnstile } from "@/server/turnstile";

export type WaitlistState =
  | { status: "idle"; attempt: number }
  | { status: "joined"; host: boolean; attempt: number }
  | { status: "error"; message: string; attempt: number };

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

/**
 * "Tell me when it opens" / Founding Host interest. Signed-in members join with one tap using
 * their account email; everyone else gives an email and passes the bot check.
 */
export async function joinWaitlistAction(
  previous: WaitlistState,
  formData: FormData,
): Promise<WaitlistState> {
  const attempt = previous.attempt + 1;
  const wantsToHost = field(formData, "host") === "1";
  const metroSlug = field(formData, "metro");
  const zip = field(formData, "zip");

  const metro = metroSlug ? await findMetroBySlug(metroSlug) : null;
  if (metroSlug && (!metro || metro.status === "open")) {
    return { status: "error", message: "That city isn't taking waitlist signups.", attempt };
  }
  const zipPlace = zip ? await findZip(zip) : null;
  if (!metro && !zipPlace) {
    return { status: "error", message: "We don't recognize that zip code.", attempt };
  }

  const viewer = await getViewer();
  let email = viewer?.email ?? null;
  if (!viewer) {
    email = field(formData, "email").toLowerCase();
    if (!z.email().max(254).safeParse(email).success) {
      return { status: "error", message: "That doesn't look like an email address.", attempt };
    }
    const remoteIp = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim();
    if (!(await verifyTurnstile(field(formData, "captchaToken"), { remoteIp }))) {
      return {
        status: "error",
        message: "The bot check didn't go through. Please try again.",
        attempt,
      };
    }
  }
  if (!email) {
    return { status: "error", message: "Add an email to your account first.", attempt };
  }

  await joinWaitlist({
    metroId: metro?.id ?? null,
    zip: zipPlace?.zip ?? null,
    email,
    userId: viewer?.id ?? null,
    wantsToHost,
  });
  refresh();
  return { status: "joined", host: wantsToHost, attempt };
}
