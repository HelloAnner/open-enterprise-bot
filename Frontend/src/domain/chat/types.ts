import type { AvatarShape } from "@/domain/bot/types";

export type MessageKind = "text" | "choice" | "file" | "images" | "image" | "kanban" | "email" | "secure" | "time" | "relay";

export interface ChatMessage {
  id: string;
  kind: MessageKind;
  from?: "bot" | "user";
  text?: string;
  paragraphs?: string[];
  list?: string[];
  title?: string;
  subtitle?: string;
  options?: string[];
  selected?: string;
  name?: string;
  size?: string;
  url?: string;
  images?: string[];
  reaction?: string;
  replyTo?: string;
  relay?: { name: string; shape: AvatarShape; color: string };
}
