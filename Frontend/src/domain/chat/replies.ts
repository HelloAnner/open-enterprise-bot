import { createMessage } from "./message";
import type { ChatMessage } from "./types";

export function createReplyPlan(text: string): ChatMessage[] {
  if (/看板|岗位|职位/.test(text)) return [
    createMessage({ kind: "text", from: "bot", text: "收到，我已经把相关机会重新按优先级排好，并同步到面试看板。" }),
    createMessage({ kind: "kanban", from: "bot", title: "面试机会看板 · 70–80万", subtitle: "刚刚更新 · 点击查看完整看板" }),
  ];
  if (/邮件|邮箱/.test(text)) return [
    createMessage({ kind: "text", from: "bot", text: "今日清单已经整理成邮件，我把发送记录放在下面。" }),
    createMessage({ kind: "email", from: "bot", title: "邮件", subtitle: "已发送邮件 · helloanner@qq.com" }),
  ];
  if (/图片|截图/.test(text)) return [
    createMessage({ kind: "text", from: "bot", text: "两条都已处理，我把结果截图放在下面，你可以点开查看大图。" }),
    createMessage({ kind: "images", from: "bot", images: ["/assets/chat-preview.svg", "/assets/chat-preview.svg"] }),
  ];
  if (/简历|文件/.test(text)) return [
    createMessage({ kind: "text", from: "bot", text: "文件我已经读到了，会重点提取项目经历、岗位匹配点和待补充信息。" }),
    createMessage({ kind: "text", from: "bot", text: "你可以继续说目标岗位，我会把结论同步到后续准备清单。" }),
  ];
  return [
    createMessage({ kind: "text", from: "bot", text: "收到，我已经记下了。这件事会按优先级加入今天的处理清单。" }),
    createMessage({ kind: "text", from: "bot", text: "你可以继续补充细节；也可以试试发送“更新看板”“发邮件”或“查看截图”，查看对应卡片样式。" }),
  ];
}
