import pg from "pg";
import type { Delivery, Event } from "../domain/contracts.js";
import { config } from "./config.js";
export const db = new pg.Pool({
  connectionString: config.DATABASE_URL,
  max: 20,
});
export class LeaseLost extends Error {
  name = "LeaseLost";
}
export async function fenced<T>(
  d: Delivery,
  fn: (tx: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const tx = await db.connect();
  try {
    await tx.query("BEGIN");
    try {
      await tx.query("SELECT control.assert_lease($1,$2,$3,$4)", [
        d.session_id,
        d.owner,
        d.epoch,
        d.event.user_id,
      ]);
    } catch (error) {
      if ((error as { code?: string }).code === "P0001")
        throw new LeaseLost("session lease lost");
      throw error;
    }
    const kind = d.session_id.startsWith("main:")
      ? "main"
      : d.session_id.startsWith("work:")
        ? "work"
        : "worker";
    await tx.query(
      "INSERT INTO runtime.sessions(id,user_id,kind,bot_id) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",
      [
        d.session_id,
        d.event.user_id,
        kind,
        kind === "main" ? null : d.event.bot_id,
      ],
    );
    const out = await fn(tx);
    await tx.query("COMMIT");
    return out;
  } catch (e) {
    await tx.query("ROLLBACK");
    throw e;
  } finally {
    tx.release();
  }
}
export async function emit(tx: pg.PoolClient, e: Event) {
  await tx.query(
    "INSERT INTO runtime.outbox(id,subject,event) VALUES($1,'eob.events.agent',$2) ON CONFLICT DO NOTHING",
    [e.event_id, e],
  );
}
export async function checkpoint(d: Delivery, value: unknown) {
  await fenced(d, async (tx) => {
    await tx.query(
      "UPDATE runtime.sessions SET checkpoint=$2,updated_at=now() WHERE id=$1",
      [d.session_id, value],
    );
  });
}
export async function decision<T>(
  d: Delivery,
  generate: () => Promise<T>,
): Promise<T> {
  const old = await db.query(
    "SELECT decision FROM runtime.turns WHERE session_id=$1 AND event_id=$2",
    [d.session_id, d.event.event_id],
  );
  if (old.rows.length) return old.rows[0].decision;
  const value = await generate();
  return fenced(d, async (tx) => {
    await tx.query(
      "INSERT INTO runtime.turns(session_id,event_id,bot_id,decision) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",
      [d.session_id, d.event.event_id, d.event.bot_id, value],
    );
    return (
      await tx.query(
        "SELECT decision FROM runtime.turns WHERE session_id=$1 AND event_id=$2",
        [d.session_id, d.event.event_id],
      )
    ).rows[0].decision;
  });
}
