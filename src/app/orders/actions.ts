"use server";

import { redirect } from "next/navigation";
import { withNext } from "@/lib/next-path";
import { getViewer, type Viewer } from "@/server/auth/session";
import { serverEnv } from "@/lib/env";
import {
  acceptOffer,
  confirmPickup,
  declineOffer,
  refundOrder,
  reportProblem,
  retryPayment,
  type ChargeResult,
} from "@/server/payments/orders";
import { payoutSetupUrl } from "@/server/payments/payouts";

/** Every order action re-checks who's signed in; the service checks they're the buyer/seller. */
async function member(orderId: string): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect(withNext("/sign-in", `/orders/${orderId}`));
  return viewer;
}

const idFrom = (formData: FormData) => String(formData.get("orderId") ?? "");
const back = (orderId: string, note?: string): never =>
  redirect(`/orders/${orderId}${note ? `?done=${note}` : ""}`);

export async function confirmPickupAction(formData: FormData): Promise<void> {
  const orderId = idFrom(formData);
  const viewer = await member(orderId);
  const ok = await confirmPickup(orderId, viewer.id);
  back(orderId, ok ? "picked-up" : undefined);
}

export type ReportState = { ok: boolean; message: string } | null;

export async function reportProblemAction(
  _prev: ReportState,
  formData: FormData,
): Promise<ReportState> {
  const orderId = idFrom(formData);
  const viewer = await member(orderId);
  const note = String(formData.get("note") ?? "").trim();
  if (note.length < 5) return { ok: false, message: "Tell us what's wrong in a few words." };
  const ok = await reportProblem(orderId, viewer.id, note);
  if (!ok) return { ok: false, message: "This order can't take a report anymore." };
  back(orderId, "reported");
  return null;
}

export async function refundAction(formData: FormData): Promise<void> {
  const orderId = idFrom(formData);
  const viewer = await member(orderId);
  const result = await refundOrder(orderId, { sellerId: viewer.id });
  back(orderId, result === "refunded" ? "refunded" : undefined);
}

export type ChargeActionResult = { ok: true } | { ok: false; message: string };

function chargeMessage(result: ChargeResult): ChargeActionResult {
  switch (result.kind) {
    case "paid":
    case "processing":
      return { ok: true };
    case "failed":
      return { ok: false, message: "That didn't go through either. Try a different card." };
    default:
      return { ok: false, message: "This order has moved on. Refresh to see where it stands." };
  }
}

/** Charge again (after saving a new card, or just once more). */
export async function retryPaymentAction(orderId: string): Promise<ChargeActionResult> {
  const viewer = await member(orderId);
  return chargeMessage(await retryPayment(orderId, viewer.id));
}

export async function acceptOfferAction(orderId: string): Promise<ChargeActionResult> {
  const viewer = await member(orderId);
  return chargeMessage(await acceptOffer(orderId, viewer.id));
}

export async function declineOfferAction(formData: FormData): Promise<void> {
  const orderId = idFrom(formData);
  const viewer = await member(orderId);
  await declineOffer(orderId, viewer.id);
  back(orderId);
}

/** Off to Stripe's hosted payout setup (in dev with FAKE_CARDS=1, straight back). */
export type PayoutSetupState = { message: string } | null;

export async function startPayoutSetup(
  _prev: PayoutSetupState,
  formData: FormData,
): Promise<PayoutSetupState> {
  const viewer = await getViewer();
  if (!viewer) redirect(withNext("/sign-in", "/account/payouts"));
  const from = String(formData.get("from") ?? "/account/payouts");
  const safeFrom = from.startsWith("/") && !from.startsWith("//") ? from : "/account/payouts";
  const base = serverEnv().APP_URL;
  let url: string;
  try {
    url = await payoutSetupUrl(
      { id: viewer.id, email: viewer.email },
      {
        returnUrl: `${base}/account/payouts/return?from=${encodeURIComponent(safeFrom)}`,
        refreshUrl: `${base}/account/payouts/refresh`,
      },
    );
  } catch (error) {
    // Stripe down or misconfigured (e.g. Connect not turned on). Log the kind, never the details.
    const { code, type } = error as { code?: string; type?: string };
    console.warn("payout setup failed", { code: code ?? type ?? "unknown" });
    return { message: "We couldn't open payout setup just now. Try again in a few minutes." };
  }
  redirect(url);
}
