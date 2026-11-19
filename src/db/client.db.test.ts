import { afterAll, describe, expect, it } from "vitest";
import { closeDb, getDb, getSql } from "./client";

describe("database clients", () => {
  afterAll(() => closeDb());

  it("raw SQL keeps real Dates even after Drizzle has been used", async () => {
    getDb(); // Drizzle rewires the parsers of the client it wraps; it must not be getSql()'s
    const [row] = await getSql()<
      { t: Date }[]
    >`select ${new Date("2026-01-01T00:00:00Z")}::timestamptz as t`;
    expect(row?.t).toBeInstanceOf(Date);
    expect(row?.t.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });
});
