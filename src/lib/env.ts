import { z } from "zod";

/**
 * Server environment, validated on first use. Every variable is documented in .env.example.
 * Optional variables gate features that later milestones turn on (Stripe, Twilio, …);
 * code that needs one should call `requireEnv("NAME")` so a missing key fails loudly.
 *
 * Never import this from client components: it reads server-only secrets.
 */

const bool = z
  .enum(["0", "1", "true", "false"])
  .optional()
  .transform((v) => v === "1" || v === "true");

const serverShape = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.url().default("http://localhost:3100"),

  // Database (Supabase Postgres + PostGIS)
  DATABASE_URL: z.string().min(1).optional(),
  NEXT_PUBLIC_SUPABASE_URL: z.url().optional(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1).optional(),
  SUPABASE_SECRET_KEY: z.string().min(1).optional(),

  // Images (Cloudflare R2; RustFS locally)
  S3_ENDPOINT: z.url().optional(),
  S3_REGION: z.string().default("auto"),
  S3_ACCESS_KEY_ID: z.string().min(1).optional(),
  S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  S3_BUCKET: z.string().min(1).optional(),
  S3_FORCE_PATH_STYLE: bool,
  NEXT_PUBLIC_IMAGE_BASE_URL: z.url().optional(),
  IMAGE_TRANSFORMS: z.enum(["cloudflare", "none"]).default("none"),

  // Email: SMTP (Mailpit) locally, Resend in production
  EMAIL_FROM: z.string().default("Life's Leftovers <hello@lifesleftovers.com>"),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().optional(),
  RESEND_API_KEY: z.string().min(1).optional(),

  // Stripe (test mode everywhere but production)
  STRIPE_SECRET_KEY: z.string().min(1).optional(),
  STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().min(1).optional(),

  // Twilio Verify
  TWILIO_ACCOUNT_SID: z.string().min(1).optional(),
  TWILIO_AUTH_TOKEN: z.string().min(1).optional(),
  TWILIO_VERIFY_SERVICE_SID: z.string().min(1).optional(),

  // Cloudflare Turnstile
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().min(1).optional(),
  TURNSTILE_SECRET_KEY: z.string().min(1).optional(),

  // Inngest
  INNGEST_EVENT_KEY: z.string().min(1).optional(),
  INNGEST_SIGNING_KEY: z.string().min(1).optional(),
  INNGEST_DEV: bool,

  // Observability (both off unless set, and only in production)
  NEXT_PUBLIC_SENTRY_DSN: z.url().optional(),
  SENTRY_AUTH_TOKEN: z.string().min(1).optional(),
  SENTRY_ORG: z.string().min(1).optional(),
  SENTRY_PROJECT: z.string().min(1).optional(),
  NEXT_PUBLIC_POSTHOG_KEY: z.string().min(1).optional(),
  NEXT_PUBLIC_POSTHOG_HOST: z.url().default("https://us.i.posthog.com"),

  // Web push (VAPID)
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string().min(1).optional(),
  VAPID_PRIVATE_KEY: z.string().min(1).optional(),

  // AI listing help and moderation
  ANTHROPIC_API_KEY: z.string().min(1).optional(),

  // Rate limiting (Upstash in production; in-memory locally)
  UPSTASH_REDIS_REST_URL: z.url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),

  // Exact pickup addresses are encrypted with this key (32 bytes, base64).
  ADDRESS_ENCRYPTION_KEY: z.string().min(1).optional(),

  // Dev-only switches — refused in production below.
  FAST_CLOCK: bool,
  ALLOW_DEV_OTP: bool,
});

/** Every variable name the app reads. .env.example must list exactly these. */
export const serverEnvKeys = Object.keys(serverShape.shape) as Array<
  keyof typeof serverShape.shape
>;

const serverSchema = serverShape.superRefine((env, ctx) => {
  if (env.NODE_ENV === "production") {
    for (const key of ["FAST_CLOCK", "ALLOW_DEV_OTP"] as const) {
      if (env[key]) {
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: `${key} must never be on in production`,
        });
      }
    }
  } else if (env.STRIPE_SECRET_KEY?.startsWith("sk_live_")) {
    // Production keys are never used locally (CLAUDE.md "How to work in this repo" #8).
    ctx.addIssue({
      code: "custom",
      path: ["STRIPE_SECRET_KEY"],
      message: "live Stripe key outside production",
    });
  }
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | undefined;

/**
 * Parse once; throws with the list of bad variables (names only, never values).
 * Blank values (`KEY=` in .env files) count as unset, so documented-but-unconfigured
 * services fall back to "off" instead of failing validation.
 */
export function serverEnv(source: NodeJS.ProcessEnv = process.env): ServerEnv {
  if (source === process.env && cached) return cached;
  const present = Object.fromEntries(Object.entries(source).filter(([, v]) => v !== ""));
  const parsed = serverSchema.safeParse(present);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment: ${problems}`);
  }
  if (source === process.env) cached = parsed.data;
  return parsed.data;
}

type OptionalKeys = {
  [K in keyof ServerEnv]-?: undefined extends ServerEnv[K] ? K : never;
}[keyof ServerEnv];

/** Read a variable a feature can't run without. */
export function requireEnv<K extends OptionalKeys>(key: K): NonNullable<ServerEnv[K]> {
  const value = serverEnv()[key];
  if (value === undefined || value === "") {
    throw new Error(`Missing required environment variable ${key} (see .env.example)`);
  }
  return value as NonNullable<ServerEnv[K]>;
}
