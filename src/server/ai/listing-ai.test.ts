import { describe, expect, it, vi } from "vitest";
import { serverEnv } from "@/lib/env";
import { createClaudeListingAi, listingAiFromEnv } from "./listing-ai";

/** A Messages API response whose text block is the structured JSON output. */
function apiReply(json: unknown, stopReason = "end_turn") {
  return new Response(
    JSON.stringify({
      id: "msg_test",
      type: "message",
      role: "assistant",
      model: "claude-haiku-5-5",
      content: [
        { type: "thinking", thinking: "", signature: "sig" },
        { type: "text", text: JSON.stringify(json) },
      ],
      stop_reason: stopReason,
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 10 },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

const photo = { jpeg: Buffer.from([0xff, 0xd8, 0xff]) };

describe("Claude listing AI", () => {
  it("asks Haiku at low effort for a structured suggestion, with photos", async () => {
    const suggestion = {
      title: "Cordless drill, 18V",
      category: "tools-building",
      condition: "good",
      description: "Drill with two batteries.",
      suggestedStartDollars: 15,
      isBrandName: false,
      looksLikeLot: false,
      lotItemCount: null,
    };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(apiReply(suggestion));
    const ai = createClaudeListingAi("sk-ant-test", { fetch: fetchMock });
    expect(await ai.suggest([photo])).toEqual(suggestion);

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.model).toBe("claude-haiku-5-5");
    expect(body.output_config.effort).toBe("low");
    expect(body.output_config.format.type).toBe("json_schema");
    expect(body.fallbacks).toBeUndefined();
    expect(body.messages[0].content[0]).toMatchObject({
      type: "image",
      source: { type: "base64" },
    });
  });

  it("sends a refused or unreadable review to a person instead of approving it", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(apiReply({}, "refusal"));
    const ai = createClaudeListingAi("sk-ant-test", { fetch: fetchMock });
    expect(await ai.moderate({ text: "Something", photos: [] })).toEqual({
      verdict: "flagged",
      reasons: ["Needs a manual review"],
    });
    warn.mockRestore();
  });

  it("is off without a key, fake only off the production deployment", () => {
    expect(listingAiFromEnv(serverEnv({ NODE_ENV: "test" }))).toBeNull();
    expect(listingAiFromEnv(serverEnv({ NODE_ENV: "test", AI_FAKE: "1" }))?.kind).toBe("fake");
    expect(
      listingAiFromEnv(serverEnv({ NODE_ENV: "test", ANTHROPIC_API_KEY: "sk-ant-x" }))?.kind,
    ).toBe("claude");
    const prod = {
      ...serverEnv({ NODE_ENV: "test", ANTHROPIC_API_KEY: "k" }),
      VERCEL_ENV: "production" as const,
      AI_FAKE: true,
    };
    expect(listingAiFromEnv(prod)?.kind).toBe("claude");
  });
});
