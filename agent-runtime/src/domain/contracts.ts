import { createHash } from "node:crypto";
import { z } from "zod";

export const eventSchema = z.object({
  version: z.literal(1),
  event_id: z.string().min(1),
  type: z.string(),
  user_id: z.string().min(1),
  bot_id: z.string().min(1),
  thread_id: z.string().optional(),
  session_id: z.string().optional(),
  ticket_id: z.string().optional(),
  worker_id: z.string().optional(),
  job_id: z.string().optional(),
  correlation_id: z.string(),
  source: z.string(),
  payload: z.record(z.string(), z.unknown()),
});
export type Event = z.infer<typeof eventSchema>;
export interface Proof {
  session_id: string;
  owner: string;
  epoch: number;
}
export interface Delivery extends Proof {
  id: string;
  event: Event;
}
export const taskSchema = z.object({
  goal: z.string().min(1).max(4000),
  tool: z.enum(["write_file", "python", "shell"]),
  input: z.record(z.string(), z.unknown()),
  authorization: z.string().optional(),
});
export type Task = z.infer<typeof taskSchema>;
export const planSchema = z.object({
  reply: z.string().max(32000),
  tasks: z.array(taskSchema).max(4).default([]),
  control: z
    .object({
      action: z.enum(["cancel", "update"]),
      ticket_id: z.string(),
      text: z.string().default(""),
    })
    .optional(),
});
export type Plan = z.infer<typeof planSchema>;
export function routerPlanSchema(executionEnabled: boolean, ticketIds: string[]) {
  const schema = planSchema.extend({ tasks: z.array(taskSchema).max(executionEnabled ? 4 : 0).default([]) });
  return ticketIds.length
    ? schema.extend({control:planSchema.shape.control.unwrap().extend({ticket_id:z.enum(ticketIds)}).optional()}).strict()
    : schema.omit({control:true}).strict();
}
export function stable(...parts: string[]) {
  const hash = createHash("sha1")
    .update(Buffer.from("6ba7b8129dad11d180b400c04fd430c8", "hex"))
    .update(parts.join("/"))
    .digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const h = hash.subarray(0, 16).toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
export function derived(
  input: Event,
  type: string,
  payload: Event["payload"],
  key = type,
): Event {
  return {
    ...input,
    event_id: stable(input.event_id, key),
    type,
    source: "agent-runtime",
    payload,
  };
}
