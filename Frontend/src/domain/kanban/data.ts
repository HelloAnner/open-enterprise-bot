import type { BoardColumn } from "./types";

export const initialBoardColumns: BoardColumn[] = [
  { id: "pending", title: "待投递", jobs: [
    { id: "job-yun", company: "云 Tibur", title: "Agent 平台工程师", meta: "上海 · 70–80万" },
    { id: "job-shuzhi", company: "数智工场", title: "AI 应用架构师", meta: "远程 · 65–75万" },
  ] },
  { id: "following", title: "副业投递跟进", jobs: [
    { id: "job-yuxi", company: "上海御熙", title: "吴旭健 · 已送达", meta: "16:24 · 待回复" },
    { id: "job-guoqing", company: "国青智联", title: "孙诗语 · 已送达", meta: "16:25 · 待回复" },
  ] },
  { id: "interviewing", title: "面试中", jobs: [
    { id: "job-fanruan", company: "帆软 AI 中台", title: "企业级 Agent", meta: "周二 · 第二轮" },
  ] },
  { id: "closed", title: "已结束", jobs: [] },
];
