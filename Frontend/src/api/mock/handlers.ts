import { delay, HttpResponse, http } from "msw";
import { createWelcomeMessages } from "@/domain/chat/fixtures";
import { createReplyPlan } from "@/domain/chat/replies";
import type { ChatMessage } from "@/domain/chat/types";
import { createId, formatBytes } from "@/lib/utils";
import { database, persist } from "./db";

const newMessage = (message: Omit<ChatMessage, "id">): ChatMessage => ({ ...message, id: createId() });
const notFound = (entity = "资源") => HttpResponse.json({ message: `${entity}不存在` }, { status: 404 });
const serverError = () => HttpResponse.json({ message: "Mock 服务暂时不可用，请重试" }, { status: 503 });

async function fileToDataUrl(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let index = 0; index < bytes.length; index += 8192) binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
  return `data:${file.type || "application/octet-stream"};base64,${btoa(binary)}`;
}

export const handlers = [
  http.get("/api/bots", async () => { await delay(120); return HttpResponse.json(database.bots); }),
  http.post("/api/bots", async ({ request }) => {
    const input = await request.json() as { name: string; shape: BotShape; color: string };
    if (!input.name?.trim()) return HttpResponse.json({ message: "Bot 名称不能为空" }, { status: 400 });
    const id = `bot-${createId()}`;
    const bot = { id, name: input.name.trim(), shape: input.shape, color: input.color, accent: input.color, preview: "新对话已创建", group: "未分组" };
    database.bots.push(bot);
    database.messages[id] = createWelcomeMessages(bot.name, "处理你的任务");
    persist();
    await delay(220);
    return HttpResponse.json(bot, { status: 201 });
  }),
  http.patch("/api/bots/:id", async ({ params, request }) => {
    const bot = database.bots.find((item) => item.id === params.id);
    if (!bot) return notFound("Bot");
    const patch = await request.json() as Partial<typeof bot>;
    Object.assign(bot, patch);
    if (patch.color) bot.accent = patch.color;
    persist();
    await delay(140);
    return HttpResponse.json(bot);
  }),
  http.delete("/api/bots/:id", async ({ params }) => {
    const id = String(params.id);
    const index = database.bots.findIndex((item) => item.id === id);
    if (index < 0) return notFound("Bot");
    database.bots.splice(index, 1);
    delete database.messages[id];
    persist();
    await delay(160);
    return new HttpResponse(null, { status: 204 });
  }),
  http.get("/api/conversations/:botId/messages", async ({ params }) => {
    const messages = database.messages[String(params.botId)];
    if (!messages) return notFound("会话");
    await delay(180);
    return HttpResponse.json(messages);
  }),
  http.post("/api/conversations/:botId/messages", async ({ params, request }) => {
    const botId = String(params.botId);
    const messages = database.messages[botId];
    const bot = database.bots.find((item) => item.id === botId);
    if (!messages || !bot) return notFound("会话");
    const input = await request.json() as { text: string; replyTo?: string };
    if (!input.text?.trim()) return HttpResponse.json({ message: "消息不能为空" }, { status: 400 });
    if (input.text.trim() === "模拟失败") return serverError();
    const userMessage = newMessage({ kind: "text", from: "user", text: input.text.trim(), replyTo: input.replyTo });
    const replies = createReplyPlan(input.text).map((message) => ({ ...message, id: createId() }));
    messages.push(userMessage, ...replies);
    bot.preview = replies.at(-1)?.text ?? input.text;
    bot.unread = false;
    persist();
    await delay(520);
    return HttpResponse.json({ userMessage, replies }, { status: 201 });
  }),
  http.post("/api/conversations/:botId/choices", async ({ params, request }) => {
    const botId = String(params.botId);
    const messages = database.messages[botId];
    if (!messages) return notFound("会话");
    const input = await request.json() as { messageId: string; optionIndex: number };
    const choice = messages.find((message) => message.id === input.messageId && message.kind === "choice");
    const option = choice?.options?.[input.optionIndex];
    if (!choice || !option) return notFound("选项");
    choice.selected = String.fromCharCode(65 + input.optionIndex);
    const userMessage = newMessage({ kind: "text", from: "user", text: option });
    const replies = [newMessage({ kind: "text", from: "bot", text: "好的，就按这个方向。我会继续处理，有新的进展再发给你。" })];
    messages.push(userMessage, ...replies);
    persist();
    await delay(420);
    return HttpResponse.json({ choice, userMessage, replies });
  }),
  http.patch("/api/conversations/:botId/messages/:messageId/reaction", async ({ params, request }) => {
    const message = database.messages[String(params.botId)]?.find((item) => item.id === params.messageId);
    if (!message) return notFound("消息");
    const input = await request.json() as { reaction: string };
    message.reaction = input.reaction;
    persist();
    await delay(100);
    return HttpResponse.json(message);
  }),
  http.delete("/api/conversations/:botId/messages/:messageId", async ({ params }) => {
    const messages = database.messages[String(params.botId)];
    if (!messages) return notFound("会话");
    const index = messages.findIndex((message) => message.id === params.messageId);
    if (index < 0) return notFound("消息");
    messages.splice(index, 1);
    persist();
    await delay(120);
    return new HttpResponse(null, { status: 204 });
  }),
  http.post("/api/conversations/:botId/files", async ({ params, request }) => {
    const botId = String(params.botId);
    const messages = database.messages[botId];
    const bot = database.bots.find((item) => item.id === botId);
    if (!messages || !bot) return notFound("会话");
    const file = (await request.formData()).get("file");
    if (!(file instanceof File)) return HttpResponse.json({ message: "缺少上传文件" }, { status: 400 });
    if (file.size > 2 * 1024 * 1024) return HttpResponse.json({ message: "演示环境文件不能超过 2 MB" }, { status: 413 });
    const dataUrl = await fileToDataUrl(file);
    const isImage = file.type.startsWith("image/");
    const userMessage = isImage
      ? newMessage({ kind: "image", from: "user", images: [dataUrl] })
      : newMessage({ kind: "file", from: "user", name: file.name, size: formatBytes(file.size), url: dataUrl });
    const replies = [newMessage({ kind: "text", from: "bot", text: isImage ? "图片收到了，我已经打开并读取其中的内容。" : "文件收到了。你可以继续告诉我需要总结、改写还是提取其中的信息。" })];
    messages.push(userMessage, ...replies);
    bot.preview = isImage ? "[图片]" : `[文件] ${file.name}`;
    persist();
    await delay(360);
    return HttpResponse.json({ userMessage, replies }, { status: 201 });
  }),
  http.get("/api/boards/interview", async () => { await delay(160); return HttpResponse.json(database.board); }),
  http.patch("/api/boards/interview/jobs/:jobId", async ({ params, request }) => {
    const source = database.board.find((column) => column.jobs.some((job) => job.id === params.jobId));
    const input = await request.json() as { columnId: string };
    const target = database.board.find((column) => column.id === input.columnId);
    if (!source || !target) return notFound("看板项目");
    if (source.id !== target.id) {
      const [job] = source.jobs.splice(source.jobs.findIndex((item) => item.id === params.jobId), 1);
      target.jobs.push(job);
      persist();
    }
    await delay(180);
    return HttpResponse.json(database.board);
  }),
  http.all("/api/*", () => serverError()),
];

type BotShape = import("@/domain/bot/types").AvatarShape;
