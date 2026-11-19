import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("generated migrations", () => {
  const files = readdirSync("drizzle").filter((f) => f.endsWith(".sql"));

  it.each(files)("%s uses the schema-qualified, unquoted geography type", (file) => {
    // See the note in src/db/geography.ts.
    expect(readFileSync(`drizzle/${file}`, "utf8")).not.toMatch(/"(extensions\.)?geography\(/);
  });
});
