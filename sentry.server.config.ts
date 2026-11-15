import * as Sentry from "@sentry/nextjs";
import { observabilityEnabled, scrubEvent, sentryDataCollection } from "@/lib/observability/scrub";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: observabilityEnabled(dsn), // off locally and in CI
  dataCollection: sentryDataCollection,
  tracesSampleRate: 0.1,
  beforeSend: (event) => scrubEvent(event),
  beforeSendTransaction: (event) => scrubEvent(event),
});
