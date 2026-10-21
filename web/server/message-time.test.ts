import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatMessageTime, normalizeMessageTimestamp } from "../shared/message-time";
import { normalizeMessages } from "./runtime-hub";

describe("message timestamps", () => {
  it("accepts valid epoch milliseconds, including zero, without inventing missing times", () => {
    const timestamp = Date.parse("2006-01-02T15:04:05Z");
    assert.equal(normalizeMessageTimestamp(timestamp), timestamp);
    assert.equal(normalizeMessageTimestamp(0), 0);
    for (const value of [undefined, null, "2006-01-02T15:04:05Z", NaN, Infinity, 9e15, {}, true]) {
      assert.equal(normalizeMessageTimestamp(value), undefined);
    }
  });

  it("formats fixed-width local dates and seconds without locale-specific punctuation", () => {
    const previous = process.env.TZ;
    try {
      process.env.TZ = "UTC";
      assert.equal(formatMessageTime(Date.parse("2006-01-02T15:04:05Z")), "2006-01-02 15:04:05");
      process.env.TZ = "Asia/Shanghai";
      assert.equal(formatMessageTime(Date.parse("2006-01-02T15:04:05Z")), "2006-01-02 23:04:05");
      assert.equal(formatMessageTime(undefined), "时间未知");
      assert.equal(formatMessageTime(NaN), "时间未知");
    } finally {
      if (previous === undefined) delete process.env.TZ;
      else process.env.TZ = previous;
    }
  });

  it("preserves Pi user/assistant timestamps through history normalization and tool results", () => {
    const start = Date.parse("2006-01-02T15:04:05Z");
    const messages = normalizeMessages([
      { role: "user", timestamp: start, content: "Inspect README" },
      { role: "assistant", timestamp: start + 1_000, content: [{ type: "toolCall", id: "read-1", name: "read", arguments: { path: "README.md" } }] },
      { role: "toolResult", timestamp: start + 2_000, toolCallId: "read-1", content: "# README" },
      { role: "assistant", timestamp: start + 3_000, content: [{ type: "text", text: "Done" }] },
      { role: "assistant", timestamp: "invalid", content: [] },
    ]);
    assert.deepEqual(messages.map((message) => message.timestamp), [start, start + 1_000, start + 3_000, undefined]);
    assert.equal(messages[1].tools[0].status, "done");
    assert.equal(messages[1].tools[0].result, "# README");
  });
});
