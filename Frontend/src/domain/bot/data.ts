import { createWelcomeMessages, fineMessages, getJobMessages } from "@/domain/chat/fixtures";
import type { Bot } from "./types";

export function createInitialBots(): Bot[] {
  return [
    { id: "moss", name: "Moss", shape: "circle", color: "#050505", accent: "#202020", preview: "主仓还没定下来的话，正式岗材料会卡住。看板还是未选定；DocuMind 昨天…", group: "未分组", hiddenInList: true },
    { id: "get-job", name: "Get Job", shape: "triangle", color: "#9655ed", accent: "#8e50df", preview: "看板已更新：御熙、国青都进了…", group: "未分组" },
    { id: "family", name: "家庭大管家", shape: "bean", color: "#ffad19", accent: "#d89516", preview: "从东山出发，今天这种凉快带风…", group: "新建分组" },
    { id: "health", name: "家庭健康专家", shape: "drop", color: "#19c783", accent: "#16ac79", preview: "今天是茜茜去鼓楼医院妇科复诊…", group: "未分组" },
    { id: "trends", name: "AI 趋势专家", shape: "splat", color: "#a97943", accent: "#9c6b3b", preview: "「AI 趋势早报」已删掉。", group: "未分组" },
    { id: "finance", name: "财务专家", shape: "cloud", color: "#268bf2", accent: "#247fd9", preview: "南京政策有，但不是「把约 14-…", group: "未分组" },
    { id: "lab", name: "思维实验室", shape: "cloud", color: "#268bf2", accent: "#247fd9", preview: "「思维实验室」已经建好了，在…", group: "未分组" },
    { id: "fine", name: "Fine 工作专家", shape: "spark", color: "#ffad19", accent: "#cc8515", preview: "《WuFan Tools 分层架构设计…", group: "未分组" },
  ];
}

export const createInitialMessages = () => ({
  moss: createWelcomeMessages("Moss", "连接不同的专家 Bot，处理日常工作"),
  "get-job": getJobMessages,
  family: createWelcomeMessages("家庭大管家", "安排家庭日程、出行和待办"),
  health: createWelcomeMessages("家庭健康专家", "整理就诊安排和健康提醒"),
  trends: createWelcomeMessages("AI 趋势专家", "追踪 AI 行业动态并提炼重点"),
  finance: createWelcomeMessages("财务专家", "梳理账单、预算与政策信息"),
  lab: createWelcomeMessages("思维实验室", "拆解问题、验证想法和做决策"),
  fine: fineMessages,
});
