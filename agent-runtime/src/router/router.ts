import {
  derived,
  stable,
  type Delivery,
  type Plan,
  type Event,
} from "../domain/contracts.js";
import { db, decision, emit, fenced } from "../infrastructure/storage.js";
import { control, proof, request, ServiceError } from "../infrastructure/http.js";
import { config } from "../infrastructure/config.js";
import * as model from "../model/planner.js";

async function output(
  d: Delivery,
  message: Record<string, unknown>,
  key: string,
) {
  const event = derived(d.event, "model.message", { message }, `output:${key}`);
  await control("/internal/output", { ...proof(d), event });
}
// Router Pool identity is main:<user_id>; it is never keyed by Bot or a random pooled conversation.
export async function router(d: Delivery) {
  const e = d.event;
  if (e.type === "ticket.report") {
    const messages = e.payload.messages as
      | Record<string, unknown>[]
      | undefined;
    for (const [i, m] of (messages ?? []).entries())
      await output(d, m, `${e.ticket_id}:${i}`);
    return;
  }
  const result = await decision<Plan>(d, async () => {
    const context = await request(
      config.GATEWAY_URL,
      `/internal/context?user_id=${encodeURIComponent(e.user_id)}&bot_id=${encodeURIComponent(e.bot_id)}`,
    );
    const tickets = (
      await db.query(
        "SELECT id,goal,state FROM runtime.tickets WHERE user_id=$1 AND bot_id=$2 AND state IN ('working','waiting')",
        [e.user_id, e.bot_id],
      )
    ).rows;
    const memory = (
      await db.query(
        "SELECT key,value FROM runtime.memory WHERE user_id=$1 AND bot_id=$2",
        [e.user_id, e.bot_id],
      )
    ).rows;
    return model.plan(d, { event: e.payload, context, tickets, memory }, tickets.map(t => String(t.id)));
  });
  await fenced(d, async (tx) => {
    for (const [index, task] of result.tasks.entries()) {
      const id = stable(e.event_id, "ticket", String(index));
      await tx.query(
        "INSERT INTO runtime.tickets(id,user_id,bot_id,thread_id,router_id,goal,plan,workdir) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING",
        [
          id,
          e.user_id,
          e.bot_id,
          e.thread_id,
          d.session_id,
          task.goal,
          task,
          `/bots/${e.bot_id}/tickets/${id}`,
        ],
      );
      const next: Event = {
        ...derived(e, "agent.ticket.created", { plan: task }, `ticket:${id}`),
        ticket_id: id,
      };
      await emit(tx, next);
    }
    if (result.control) {
      const target = await tx.query(
        "SELECT id FROM runtime.tickets WHERE id=$1 AND user_id=$2 AND bot_id=$3",
        [result.control.ticket_id, e.user_id, e.bot_id],
      );
      if (!target.rows.length)
        throw new ServiceError(403, "router control target");
      await emit(
        tx,
        derived(
          e,
          `control.${result.control.action}`,
          {
            target: { ticket_id: result.control.ticket_id },
            message: { text: result.control.text },
          },
          "control",
        ),
      );
    }
  });
  if (result.reply)
    await output(d, { kind: "text", text: result.reply }, "reply");
}
export async function reportFailure(d: Delivery) {
  // Provider details and credentials are intentionally not exposed to the chat.
  const message = {
    kind: "text",
    text: "本轮处理失败，未报告执行成功。请检查模型或执行服务配置后重试。",
  };
  if (d.session_id.startsWith("main:")) await output(d, message, "error");
  else
    await fenced(d, async (tx) => {
      if (d.event.ticket_id && !d.event.type.startsWith("control.")) {
        await tx.query(
          "UPDATE runtime.tickets SET state='failed' WHERE id=$1 AND user_id=$2",
          [d.event.ticket_id, d.event.user_id],
        );
        await tx.query(
          "UPDATE runtime.workers SET state='failed' WHERE ticket_id=$1 AND user_id=$2 AND current_job_id IS NULL",
          [d.event.ticket_id, d.event.user_id],
        );
      }
      await emit(
        tx,
        derived(d.event, "ticket.report", { messages: [message] }, "failure"),
      );
    });
}
