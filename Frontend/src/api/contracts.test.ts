import { describe, expect, it } from "vitest";
import { botSchema, messageResultSchema } from "./contracts";

describe("API contracts", () => {
  it("accepts a valid bot summary without embedding conversation messages", () => {
    const bot = { id: "bot-1", name: "Assistant", shape: "home", color: "#ff7b18", accent: "#ff7b18", preview: "", group: "未分组" };
    expect(botSchema.parse(bot)).toEqual(bot);
    expect("messages" in bot).toBe(false);
  });

  it("accepts asynchronous acknowledgement without fabricating bot replies", () => {
    const result = messageResultSchema.parse({ userMessage: { id: "m1", kind: "text", from: "user", text: "生成报告" }, replies: [], pending: true });
    expect(result.pending).toBe(true);
    expect(result.replies).toEqual([]);
  });

  it("rejects malformed server payloads", () => {
    expect(botSchema.safeParse({ id: "broken" }).success).toBe(false);
    expect(messageResultSchema.safeParse({ userMessage: { id: "m1", kind: "unknown" }, replies: [] }).success).toBe(false);
  });
});
