import * as Sentry from "@sentry/nextjs";
import posthog from "posthog-js";
import { observabilityEnabled, scrubEvent, sentryDataCollection } from "@/lib/observability/scrub";

// Both are inlined at build time; without them (local, CI) nothing initializes.
const sentryDsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;

Sentry.init({
  dsn: sentryDsn,
  enabled: observabilityEnabled(sentryDsn),
  dataCollection: sentryDataCollection,
  tracesSampleRate: 0.1,
  beforeSend: (event) => scrubEvent(event),
});

if (observabilityEnabled(posthogKey)) {
  posthog.init(posthogKey!, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
    person_profiles: "identified_only",
    capture_pageview: "history_change",
    // Privacy: no session replays (chat and pickup screens show addresses) and no autocapture
    // of arbitrary clicks/inputs; product events are captured explicitly.
    disable_session_recording: true,
    autocapture: false,
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
