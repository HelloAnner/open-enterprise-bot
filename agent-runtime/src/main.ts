import { createServer } from "node:http";
import { setTimeout as sleep } from "node:timers/promises";
import { connect } from "nats";
import { ZodError } from "zod";
import { config } from "./infrastructure/config.js";
import { db, LeaseLost } from "./infrastructure/storage.js";
import { control, proof, ServiceError } from "./infrastructure/http.js";
import { eventSchema, type Delivery } from "./domain/contracts.js";
import { router, reportFailure } from "./router/router.js";
import { ticket } from "./ticket/ticket.js";
import { worker } from "./worker/worker.js";

let stopping = false;
const active = new Set<Promise<void>>();
// Use OS DNS lookup/search domains for Kubernetes short Service names, not raw A/AAAA queries.
const nc = await connect({
  servers: config.NATS_URL,
  user: config.NATS_USER,
  pass: config.NATS_PASSWORD,
  resolve: false,
  waitOnFirstConnect: true,
  maxReconnectAttempts: -1,
});
const js = nc.jetstream();
await db.query("SELECT 1");
const server = createServer(async (req, res) => {
  if (req.url === "/healthz") {
    res.end("ok");
    return;
  }
  if (req.url === "/readyz") {
    try {
      await db.query("SELECT 1");
      res.statusCode = stopping || nc.isClosed() ? 503 : 200;
    } catch {
      res.statusCode = 503;
    }
    res.end();
    return;
  }
  res.statusCode = 404;
  res.end();
});
server.listen(Number(config.LISTEN_ADDR.split(":").at(-1)));
const heartbeat = setInterval(
  () => {
    void control("/internal/sessions/heartbeat", { owner: config.owner }).catch(
      (e) => console.error("heartbeat failed", e.message),
    );
  },
  (config.LEASE_SECONDS * 1000) / 3,
);

async function publish() {
  while (!stopping) {
    const tx = await db.connect();
    try {
      await tx.query("BEGIN");
      const row = (
        await tx.query(
          "SELECT * FROM runtime.outbox WHERE sent_at IS NULL ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1",
        )
      ).rows[0];
      if (row) {
        await js.publish(row.subject, Buffer.from(JSON.stringify(row.event)), {
          msgID: row.id,
        });
        await tx.query("UPDATE runtime.outbox SET sent_at=now() WHERE id=$1", [
          row.id,
        ]);
      }
      await tx.query("COMMIT");
    } catch (e) {
      await tx.query("ROLLBACK");
      console.error("outbox retry", (e as Error).message);
    } finally {
      tx.release();
    }
    await sleep(100);
  }
}
async function handle(d: Delivery) {
  let validEvent = false;
  try {
    d.event = eventSchema.parse(d.event);
    validEvent = true;
    if (d.session_id === `main:${d.event.user_id}`) await router(d);
    else if (d.session_id === `work:${d.event.ticket_id}`) await ticket(d);
    else if (d.session_id === `worker:${d.event.worker_id}`) await worker(d);
    else throw new ServiceError(400, "delivery target");
    await control(`/internal/deliveries/${d.id}/complete`, proof(d));
  } catch (e) {
    if (e instanceof LeaseLost) return;
    console.error("turn failed", {
      session: d.session_id,
      event: d.event?.event_id,
      error: (e as Error).message,
    });
    try {
      // Transport/DB failures remain recoverable. Invalid/model failures produce an honest final result.
      const retry =
        !(e instanceof ZodError) &&
        !String((e as Error).message).startsWith("MODEL:") &&
        !(
          e instanceof ServiceError &&
          [400, 403, 404, 409, 422].includes(e.status)
        );
      if (!retry && validEvent) await reportFailure(d);
      await control(`/internal/deliveries/${d.id}/complete`, {
        ...proof(d),
        retry,
      });
    } catch (error) {
      console.error("delivery remains durable", (error as Error).message);
    }
    await sleep(1000);
  }
}
async function consume() {
  while (!stopping) {
    try {
      if (active.size >= config.RUNTIME_CONCURRENCY) {
        await Promise.race(active);
        continue;
      }
      const d = await control<Delivery | null>("/internal/sessions/claim", {
        owner: config.owner,
      });
      if (!d) {
        await sleep(100);
        continue;
      }
      const task = handle(d);
      active.add(task);
      void task.finally(() => active.delete(task));
    } catch (e) {
      console.error("claim retry", (e as Error).message);
      await sleep(1000);
    }
  }
}
for (const sig of ["SIGTERM", "SIGINT"] as const)
  process.on(sig, () => {
    stopping = true;
    server.close();
  });
await Promise.all([publish(), consume()]);
await Promise.all(active);
clearInterval(heartbeat);
await nc.drain();
await db.end();
