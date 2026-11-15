import { describe, expect, it } from "vitest";
import { serverEnv } from "./env";

describe("serverEnv", () => {
  it("accepts an empty development environment with defaults", () => {
    const env = serverEnv({ NODE_ENV: "development" });
    expect(env.APP_URL).toBe("http://localhost:3000");
    expect(env.FAST_CLOCK).toBe(false);
    expect(env.ALLOW_DEV_OTP).toBe(false);
  });

  it("treats blank values from .env files as unset", () => {
    const env = serverEnv({
      NODE_ENV: "development",
      STRIPE_SECRET_KEY: "",
      UPSTASH_REDIS_REST_URL: "",
    });
    expect(env.STRIPE_SECRET_KEY).toBeUndefined();
    expect(env.UPSTASH_REDIS_REST_URL).toBeUndefined();
  });

  it("accepts the committed .env.example as a valid development environment", async () => {
    const { parseEnv } = await import("node:util");
    const { readFileSync } = await import("node:fs");
    const example = parseEnv(readFileSync(".env.example", "utf8"));
    expect(() => serverEnv({ ...example, NODE_ENV: "development" })).not.toThrow();
  });

  it("parses boolean switches", () => {
    expect(serverEnv({ NODE_ENV: "development", FAST_CLOCK: "1" }).FAST_CLOCK).toBe(true);
    expect(serverEnv({ NODE_ENV: "development", ALLOW_DEV_OTP: "true" }).ALLOW_DEV_OTP).toBe(true);
  });

  it("refuses dev-only switches in production", () => {
    expect(() => serverEnv({ NODE_ENV: "production", ALLOW_DEV_OTP: "1" })).toThrow(
      /ALLOW_DEV_OTP/,
    );
    expect(() => serverEnv({ NODE_ENV: "production", FAST_CLOCK: "1" })).toThrow(/FAST_CLOCK/);
  });

  it("refuses live Stripe keys outside production", () => {
    expect(() => serverEnv({ NODE_ENV: "development", STRIPE_SECRET_KEY: "sk_live_abc" })).toThrow(
      /STRIPE_SECRET_KEY/,
    );
    expect(
      serverEnv({ NODE_ENV: "development", STRIPE_SECRET_KEY: "sk_test_abc" }).STRIPE_SECRET_KEY,
    ).toBe("sk_test_abc");
  });

  it("never echoes variable values in errors", () => {
    try {
      serverEnv({ NODE_ENV: "development", STRIPE_SECRET_KEY: "sk_live_supersecret" });
      expect.unreachable();
    } catch (e) {
      expect(String(e)).not.toContain("supersecret");
    }
  });
});

describe(".env.example", () => {
  it("documents exactly the variables the app reads", async () => {
    const { readFileSync } = await import("node:fs");
    const { serverEnvKeys } = await import("./env");
    const documented = readFileSync(".env.example", "utf8")
      .split("\n")
      .map((line) => /^([A-Z][A-Z0-9_]*)=/.exec(line)?.[1])
      .filter((k): k is string => Boolean(k));
    expect([...documented].sort()).toEqual(serverEnvKeys.filter((k) => k !== "NODE_ENV").sort());
  });
});
