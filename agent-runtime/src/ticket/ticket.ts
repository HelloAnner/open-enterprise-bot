import {
  derived,
  stable,
  type Delivery,
  type Task,
  type Event,
} from "../domain/contracts.js";
import { db, emit, fenced, checkpoint } from "../infrastructure/storage.js";
import { control, proof, ServiceError } from "../infrastructure/http.js";

export async function ticket(d: Delivery) {
  const e = d.event;
  const t = (
    await db.query(
      "SELECT * FROM runtime.tickets WHERE id=$1 AND user_id=$2 AND bot_id=$3",
      [e.ticket_id, e.user_id, e.bot_id],
    )
  ).rows[0];
  if (!t) throw new ServiceError(404, "ticket state");
  e.thread_id ??= t.thread_id;
  if (e.type === "worker.report") {
    await fenced(d, async (tx) => {
      const active = await tx.query(
        "SELECT count(*)::int AS count FROM runtime.workers WHERE ticket_id=$1 AND state IN ('working','stopping')",
        [t.id],
      );
      const failed = await tx.query(
        "SELECT count(*)::int AS count FROM runtime.workers WHERE ticket_id=$1 AND state='failed'",
        [t.id],
      );
      const state = active.rows[0].count
        ? "working"
        : failed.rows[0].count
          ? "failed"
          : e.payload.state === "stopped"
            ? "stopped"
            : "completed";
      await tx.query("UPDATE runtime.tickets SET state=$2 WHERE id=$1", [
        t.id,
        state,
      ]);
      await emit(tx, derived(e, "ticket.report", { ...e.payload, state }));
    });
    return;
  }
  if (e.type !== "agent.ticket.created" && e.type !== "security.submitted") {
    await checkpoint(d, { last_input: e });
    await fenced(d, async (tx) => {
      const workers = await tx.query(
        "SELECT id FROM runtime.workers WHERE ticket_id=$1",
        [t.id],
      );
      for (const w of workers.rows)
        await emit(tx, {
          ...derived(e, "ticket.input", e.payload, `input:${w.id}`),
          worker_id: w.id,
        });
    });
    return;
  }
  const plan: Task = t.plan;
  if (plan.authorization && e.type !== "security.submitted") {
    const form = await control<{ form_id: string }>(
      "/internal/security-forms",
      {
        ...proof(d),
        bot_id: e.bot_id,
        ticket_id: t.id,
        scope: plan.authorization,
      },
    );
    await fenced(d, async (tx) => {
      await tx.query("UPDATE runtime.tickets SET state='waiting' WHERE id=$1", [
        t.id,
      ]);
      await emit(
        tx,
        derived(e, "ticket.report", {
          state: "waiting",
          messages: [
            {
              kind: "secure",
              title: "需要安全授权",
              text: `请通过安全表单提交授权，勿在对话中发送密码。表单 ID：${form.form_id}`,
            },
          ],
        }),
      );
    });
    return;
  }
  if (e.type === "security.submitted") {
    plan.input = {
      ...plan.input,
      vault_ref: e.payload.vault_ref,
      scope: e.payload.scope,
    };
  }
  const id = stable(t.id, "worker", "0");
  await fenced(d, async (tx) => {
    await tx.query("UPDATE runtime.tickets SET state='working' WHERE id=$1", [
      t.id,
    ]);
    await tx.query(
      "INSERT INTO runtime.workers(id,user_id,ticket_id,workdir,plan) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",
      [id, e.user_id, t.id, `${t.workdir}/workers/${id}`, plan],
    );
    const next: Event = {
      ...derived(e, "agent.worker.created", { plan }, `worker:${id}`),
      worker_id: id,
    };
    await emit(tx, next);
  });
}
