import { closeAuctionOnTime, closeOverdueAuctions } from "./closing";
import { hello } from "./hello";
import { chargeNewOrder, orderTimer, paymentsSweep, payoutRun } from "./payments";

/** Every Inngest function served at /api/inngest. */
export const functions = [
  hello,
  closeAuctionOnTime,
  closeOverdueAuctions,
  chargeNewOrder,
  orderTimer,
  paymentsSweep,
  payoutRun,
];
