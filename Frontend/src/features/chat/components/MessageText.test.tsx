import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { MessageText } from "./MessageText";

test("render model Markdown without active HTML, script links or tracking images", () => {
  const html = renderToStaticMarkup(<MessageText text={'**真实回复**\n\n- 已连接\n\n<script>alert(1)</script>\n\n[危险](javascript:alert(1))\n\n![追踪](https://example.invalid/tracker)'} />);
  expect(html).toContain('<strong>真实回复</strong>');
  expect(html).toContain('<li>已连接</li>');
  expect(html).not.toMatch(/<script|<img|javascript:/);
});
