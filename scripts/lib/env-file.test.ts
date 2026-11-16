import { describe, expect, it } from "vitest";
import { setEnvValues } from "./env-file";

describe("setEnvValues", () => {
  const text = "# comment\nA=1\nSUPABASE_SECRET_KEY=\nB=2\n";

  it("fills blank values in place and keeps everything else", () => {
    expect(setEnvValues(text, { SUPABASE_SECRET_KEY: "sb_secret_x" })).toBe(
      "# comment\nA=1\nSUPABASE_SECRET_KEY=sb_secret_x\nB=2\n",
    );
  });

  it("replaces existing values", () => {
    expect(setEnvValues("A=old\n", { A: "new" })).toBe("A=new\n");
  });

  it("appends keys that are missing", () => {
    expect(setEnvValues("A=1\n", { C: "3" })).toBe("A=1\nC=3\n");
  });

  it("handles Windows line endings", () => {
    expect(setEnvValues("A=1\r\nB=\r\n", { B: "2" })).toBe("A=1\nB=2\n");
  });
});
