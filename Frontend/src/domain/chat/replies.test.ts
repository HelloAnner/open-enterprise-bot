import { describe, expect, it } from "vitest";
import { createReplyPlan } from "./replies";

describe("createReplyPlan", () => {
  it("returns the matching enterprise card", () => {
    expect(createReplyPlan("更新看板").at(-1)?.kind).toBe("kanban");
    expect(createReplyPlan("发邮件").at(-1)?.kind).toBe("email");
    expect(createReplyPlan("查看截图").at(-1)?.images).toHaveLength(2);
  });

  it("keeps the default response as consecutive bot messages", () => {
    const plan = createReplyPlan("你好");
    expect(plan).toHaveLength(2);
    expect(plan.every((message) => message.from === "bot")).toBe(true);
  });
});
