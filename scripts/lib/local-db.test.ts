import { describe, expect, it } from "vitest";
import { assertLocalDatabaseUrl } from "./local-db";

describe("assertLocalDatabaseUrl", () => {
  it.each([
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
    "postgresql://postgres:postgres@localhost:54322/postgres",
    "postgres://u:p@[::1]:5432/db",
  ])("allows %s", (url) => {
    expect(assertLocalDatabaseUrl(url)).toBe(url);
  });

  it.each([
    "postgresql://postgres.abc:pw@aws-0-us-east-1.pooler.supabase.com:6543/postgres",
    "postgresql://u:p@db.example.com:5432/postgres",
    "postgresql://u:p@10.0.0.5:5432/postgres",
  ])("refuses %s", (url) => {
    expect(() => assertLocalDatabaseUrl(url)).toThrow(/non-local/);
  });

  it("refuses missing or malformed URLs without echoing them", () => {
    expect(() => assertLocalDatabaseUrl(undefined)).toThrow(/not set/);
    expect(() => assertLocalDatabaseUrl("not a url secretpw")).toThrow(/not a valid URL/);
    try {
      assertLocalDatabaseUrl("postgresql://u:secretpw@db.example.com/x");
    } catch (e) {
      expect(String(e)).not.toContain("secretpw");
    }
  });
});
