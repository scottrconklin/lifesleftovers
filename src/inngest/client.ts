import { Inngest } from "inngest";

/**
 * The single Inngest client. Locally INNGEST_DEV=1 points it at `pnpm jobs:dev` (:8288);
 * in production INNGEST_EVENT_KEY / INNGEST_SIGNING_KEY are required.
 * Closing jobs (M5), payouts (M6) and notifications (M9) register their functions in ./functions.
 */
export const inngest = new Inngest({ id: "lifesleftovers" });
