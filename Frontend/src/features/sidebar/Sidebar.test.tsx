import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import type { Bot } from "@/domain/bot/types";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Sidebar } from "./Sidebar";

const fixture = vi.hoisted(() => ({
  bots: [] as Bot[],
  ui: { activeBotId: "work", searchQuery: "", collapsedGroups: [], typingBotIds: [], selectBot: () => {}, setSearchQuery: () => {}, toggleGroup: () => {} },
}));
vi.mock("@/api/hooks/bots", () => ({
  useBotsQuery: () => ({ data: fixture.bots }),
  usePatchBotMutation: () => ({}), useDeleteBotMutation: () => ({}), useSaveBotMutation: () => ({}),
}));
vi.mock("@/api/session", () => ({ useSession: () => ({ data: { name: "Test" } }), logout: () => {} }));
vi.mock("@/stores/uiStore", () => ({ useUiStore: (select?: (state: typeof fixture.ui) => unknown) => select ? select(fixture.ui) : fixture.ui }));

const render = () => renderToStaticMarkup(<TooltipProvider><Sidebar mobileOpen={false} onMobileClose={() => {}} /></TooltipProvider>);
const pinnedArea = (html: string) => html.match(/<section class="pinned-bots"[^>]*>(.*?)<\/section>/)?.[1] ?? "";

test("Open Bot is a distinct Bot; pinning moves each real Bot once instead of aliasing the first", () => {
  fixture.bots = [
    { id: "work", name: "工作助手", shape: "home", color: "#2589f5", accent: "#2589f5", preview: "work history", group: "工作" },
    { id: "english", name: "English", shape: "home", color: "#ff7b18", accent: "#ff7b18", preview: "English history", group: "未分组" },
    { id: "open", name: "Open Bot", shape: "circle", color: "#050505", accent: "#202020", preview: "", group: "未分组", pinned: true },
  ];
  let html = render();
  for (const bot of fixture.bots) expect(html.split(`aria-label="打开 ${bot.name}"`)).toHaveLength(2);
  expect(pinnedArea(html)).toContain('aria-label="打开 Open Bot"');
  expect(pinnedArea(html)).not.toContain('aria-label="打开 工作助手"');
  expect(html).not.toContain('aria-label="打开工作空间"');

  fixture.bots[0].pinned = true;
  html = render();
  expect(pinnedArea(html)).toContain('aria-label="打开 工作助手"');
  expect(pinnedArea(html)).toContain('aria-current="page"');
  expect(pinnedArea(html)).not.toContain('aria-label="打开 English"');
  expect(html.split('aria-label="打开 工作助手"')).toHaveLength(2);
  expect(fixture.bots[0].group).toBe("工作");

  fixture.bots.forEach(bot => { bot.pinned = false; });
  html = render();
  expect(pinnedArea(html)).toBe("");
  for (const bot of fixture.bots) expect(html.split(`aria-label="打开 ${bot.name}"`)).toHaveLength(2);
  fixture.ui.searchQuery = "Open";
  html = render();
  expect(html).toContain('aria-label="打开 Open Bot"');
  expect(html).not.toContain('aria-label="打开 工作助手"');
  fixture.bots[2].hidden = true;
  expect(render()).not.toMatch(/aria-label="打开 /);
});
