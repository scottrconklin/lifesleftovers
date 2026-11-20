import "server-only";
import { paymentGatewayFromEnv, type PaymentGateway } from "./gateway";

/** What the money code needs injected: tests pass a fake gateway and a fixed clock. */
export type Deps = { gateway?: PaymentGateway | null; now?: Date };

export class PaymentsNotConfigured extends Error {
  constructor() {
    super("Payments aren't set up on this server (STRIPE_SECRET_KEY or FAKE_CARDS=1)");
  }
}

export function gatewayFrom(deps: Deps): PaymentGateway {
  const gateway = deps.gateway === undefined ? paymentGatewayFromEnv() : deps.gateway;
  if (!gateway) throw new PaymentsNotConfigured();
  return gateway;
}
