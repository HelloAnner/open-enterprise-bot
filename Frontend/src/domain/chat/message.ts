import type { ChatMessage } from "./types";

let sequence = 0;

export function createMessage(message: Omit<ChatMessage, "id">): ChatMessage {
  sequence += 1;
  return { ...message, id: `message-${sequence}` };
}

export function messageText(message: ChatMessage): string {
  return message.text ?? message.name ?? message.title ?? message.paragraphs?.join("\n") ?? "图片消息";
}

export function messagePreview(message: ChatMessage): string {
  const text = messageText(message);
  return text.length > 34 ? `${text.slice(0, 34)}…` : text;
}
