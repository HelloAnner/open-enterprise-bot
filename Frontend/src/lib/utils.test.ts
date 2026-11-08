import { afterEach, expect, test, vi } from "vitest";
import { copyText } from "./utils";

afterEach(() => vi.unstubAllGlobals());

test("HTTP clipboard fallback remains inside the active modal focus scope", async () => {
  let parent: unknown;
  const menu = { append: vi.fn(() => { parent = menu; }) };
  const focused = { closest: () => menu, focus: vi.fn() };
  const input = { value: "", readOnly: false, style: {}, select: () => { if (parent === menu) doc.activeElement = input; }, remove: vi.fn() };
  const doc = { activeElement: focused as unknown, body: {append:vi.fn()}, createElement: () => input, execCommand: vi.fn(() => doc.activeElement === input) };
  vi.stubGlobal("window", {isSecureContext:false});
  vi.stubGlobal("navigator", {});
  vi.stubGlobal("document", doc);
  await copyText("real-message-id");
  expect(menu.append).toHaveBeenCalledWith(input);
  expect(input.value).toBe("real-message-id");
  expect(input.remove).toHaveBeenCalledOnce();
  expect(focused.focus).toHaveBeenCalledOnce();
});
