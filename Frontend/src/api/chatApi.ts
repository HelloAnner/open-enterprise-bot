import { z } from "zod";
import { apiClient } from "./client";
import { boardSchema, botsSchema, botSchema, choiceResultSchema, messageResultSchema, messageSchema, messagesSchema } from "./contracts";
import type { AvatarShape, Bot } from "@/domain/bot/types";
import type { BoardColumn } from "@/domain/kanban/types";

export interface BotWriteInput { name: string; shape: AvatarShape; color: string }
export type BotPatch = Partial<Pick<Bot, "name" | "shape" | "color" | "accent" | "group" | "hidden" | "pinned" | "unread">>;

export const chatApi = {
  listBots: (signal?: AbortSignal) => apiClient("/bots", botsSchema, { signal }),
  listMessages: (botId: string, signal?: AbortSignal) => apiClient(`/conversations/${botId}/messages`, messagesSchema, { signal }),
  markRead: (botId: string, messageId: string) => apiClient(`/conversations/${botId}/read`, z.undefined(), {method:"PATCH",body:JSON.stringify({messageId})}),
  createBot: (input: BotWriteInput) => apiClient("/bots", botSchema, { method: "POST", body: JSON.stringify(input) }),
  updateBot: (id: string, patch: BotPatch) => apiClient(`/bots/${id}`, botSchema, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteBot: (id: string) => apiClient(`/bots/${id}`, z.undefined(), { method: "DELETE" }),
  sendMessage: (botId: string, input: { text: string; replyTo?: string }) => apiClient(`/conversations/${botId}/messages`, messageResultSchema, { method: "POST", body: JSON.stringify(input) }),
  chooseOption: (botId: string, input: { messageId: string; optionIndex: number }) => apiClient(`/conversations/${botId}/choices`, choiceResultSchema, { method: "POST", body: JSON.stringify(input) }),
  reactToMessage: (botId: string, messageId: string, reaction: string) => apiClient(`/conversations/${botId}/messages/${messageId}/reaction`, messageSchema, { method: "PATCH", body: JSON.stringify({ reaction }) }),
  deleteMessage: (botId: string, messageId: string) => apiClient(`/conversations/${botId}/messages/${messageId}`, z.undefined(), { method: "DELETE" }),
  uploadFile: (botId: string, file: File) => {
    const body = new FormData();
    body.append("file", file);
    return apiClient(`/conversations/${botId}/files`, messageResultSchema, { method: "POST", body });
  },
  getBoard: (signal?: AbortSignal): Promise<BoardColumn[]> => apiClient("/boards/interview", boardSchema, { signal }),
  moveJob: (jobId: string, columnId: string) => apiClient(`/boards/interview/jobs/${jobId}`, boardSchema, { method: "PATCH", body: JSON.stringify({ columnId }) }),
};
