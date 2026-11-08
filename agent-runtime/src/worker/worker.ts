import {
  derived,
  stable,
  type Delivery,
  type Task,
} from "../domain/contracts.js";
import {
  db,
  decision,
  emit,
  fenced,
  checkpoint,
} from "../infrastructure/storage.js";
import { control, proof, ServiceError } from "../infrastructure/http.js";
import * as model from "../model/planner.js";

async function start(d: Delivery, plan: Task, key: string) {
  const operation = stable(d.event.worker_id!, key);
  const id = stable("job", d.event.user_id, operation);
  // Persist the execution association BEFORE Start can generate a completion event.
  const accepted = await fenced(d, async (tx) => {
    const changed = await tx.query(
      "UPDATE runtime.workers SET current_job_id=$2,plan=$3,pending_plan=NULL,state='working' WHERE id=$1 AND user_id=$4 AND state NOT IN ('completed','failed','stopped') AND (current_job_id IS NULL OR current_job_id=$2 OR (current_job_id=$5 AND state='stopping')) RETURNING id",
      [d.event.worker_id, id, plan, d.event.user_id, d.event.job_id ?? null],
    );
    return !!changed.rowCount;
  });
  if (!accepted) return;
  await control("/internal/jobs", {
    ...proof(d),
    operation_id: operation,
    worker_id: d.event.worker_id,
    tool: plan.tool,
    input: plan.input,
  });
}
export async function worker(d: Delivery) {
  const e = d.event;
  const w = (
    await db.query(
      "SELECT * FROM runtime.workers WHERE id=$1 AND user_id=$2 AND ticket_id=$3",
      [e.worker_id, e.user_id, e.ticket_id],
    )
  ).rows[0];
  if (!w) throw new ServiceError(404, "worker state");
  if (e.type === "agent.worker.created") {
    await start(d, w.plan, e.event_id);
    return;
  }
  if (e.type === "control.update" || e.type === "control.cancel") {
    if (e.job_id && w.current_job_id !== e.job_id) return; // A stale target must not cancel a replacement Job.
    let pending: Task | null = null;
    if (e.type === "control.update")
      pending = await decision(d, () =>
        model.replan(d, { previous: w.plan, update: e.payload }),
      );
    await fenced(d, async (tx) => {
      await tx.query(
        "UPDATE runtime.workers SET pending_plan=$2,state='stopping' WHERE id=$1",
        [w.id, pending],
      );
    });
    if (!w.current_job_id) {
      if (pending) await start(d, pending, e.event_id);
      return;
    }
    const actual = await control<{
      state: string;
      result: Record<string, unknown>;
    }>(`/internal/jobs/${w.current_job_id}/stop`, proof(d));
    // Stop acceptance is not stopped. Resume only from a confirmed terminal snapshot/event.
    if (["completed", "failed", "stopped"].includes(actual.state))
      await finish(
        {
          ...d,
          event: {
            ...e,
            type: `job.${actual.state}`,
            job_id: w.current_job_id,
            payload: actual.result,
          },
        },
        pending,
        e.event_id,
      );
    return;
  }
  if (
    e.type === "job.completed" ||
    e.type === "job.failed" ||
    e.type === "job.stopped"
  ) {
    if (w.current_job_id !== e.job_id) return;
    await finish(d, w.pending_plan, e.event_id);
    return;
  }
  await checkpoint(d, { last_event: e });
}
async function finish(d: Delivery, pending: Task | null, key: string) {
  const e = d.event;
  if (pending) {
    await start(d, pending, `replacement:${e.job_id}`);
    return;
  }
  await fenced(d, async (tx) => {
    // Check again in the transaction: late completion cannot overwrite newer execution state.
    const changed = await tx.query(
      "UPDATE runtime.workers SET state=$3 WHERE id=$1 AND current_job_id=$2 AND state NOT IN ('completed','failed','stopped') RETURNING id",
      [e.worker_id, e.job_id, e.type.slice(4)],
    );
    if (!changed.rowCount) return;
    const artifacts = (e.payload.artifacts ?? []) as {
      name: string;
      url: string;
      size: string;
    }[];
    const messages: Record<string, unknown>[] = [
      {
        kind: "text",
        text:
          e.type === "job.completed"
            ? e.payload.text || "任务已完成。"
            : e.type === "job.stopped"
              ? "任务已停止。"
              : "任务执行失败。",
      },
    ];
    for (const a of artifacts)
      messages.push({ kind: "file", name: a.name, url: a.url, size: a.size });
    await emit(
      tx,
      derived(
        e,
        "worker.report",
        { state: e.type.slice(4), messages, artifacts },
        `report:${key}`,
      ),
    );
  });
}
