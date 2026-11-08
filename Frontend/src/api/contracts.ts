import { z } from "zod";
import { AVATAR_SHAPES } from "@/domain/bot/types";

const avatarShape = z.enum(AVATAR_SHAPES);
export const messageSchema = z.object({
  id: z.string(),
  kind: z.enum(["text", "choice", "file", "images", "image", "kanban", "email", "secure", "time", "relay"]),
  from: z.enum(["bot", "user"]).optional(),
  text: z.string().optional(),
  paragraphs: z.array(z.string()).optional(),
  list: z.array(z.string()).optional(),
  title: z.string().optional(),
  subtitle: z.string().optional(),
  options: z.array(z.string()).optional(),
  selected: z.string().optional(),
  name: z.string().optional(),
  size: z.string().optional(),
  url: z.string().optional(),
  images: z.array(z.string()).optional(),
  reaction: z.string().optional(),
  replyTo: z.string().optional(),
  relay: z.object({ name: z.string(), shape: avatarShape, color: z.string() }).optional(),
});

export const botSchema = z.object({
  id: z.string(), name: z.string(), shape: avatarShape, color: z.string(), accent: z.string(),
  preview: z.string(), group: z.string(), hidden: z.boolean().optional(),
  pinned: z.boolean().optional(), unread: z.boolean().optional(),
});

export const boardColumnSchema = z.object({
  id: z.string(), title: z.string(), jobs: z.array(z.object({ id: z.string(), company: z.string(), title: z.string(), meta: z.string() })),
});

export const messageResultSchema = z.object({ userMessage: messageSchema, replies: z.array(messageSchema), pending: z.boolean().optional() });
export const choiceResultSchema = messageResultSchema.extend({ choice: messageSchema });
export const botsSchema = z.array(botSchema);
export const messagesSchema = z.array(messageSchema);
export const boardSchema = z.array(boardColumnSchema);
