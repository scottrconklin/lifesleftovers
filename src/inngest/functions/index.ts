import { closeAuctionOnTime, closeOverdueAuctions } from "./closing";
import { hello } from "./hello";

/** Every Inngest function served at /api/inngest. */
export const functions = [hello, closeAuctionOnTime, closeOverdueAuctions];
