import { config } from "./config.js";
import type { Proof } from "../domain/contracts.js";
import { LeaseLost } from "./storage.js";
export class ServiceError extends Error {
  constructor(
    public status: number,
    path: string,
  ) {
    super(`service ${path}: HTTP ${status}`);
  }
}
export async function request<T = unknown>(
  base: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const r = await fetch(base + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.tokens["agent-runtime"]}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) {
    const body = (await r.json().catch(() => null)) as {
      message?: string;
    } | null;
    if (r.status === 409 && body?.message?.includes("lease"))
      throw new LeaseLost("fenced request rejected");
    throw new ServiceError(r.status, path);
  }
  return (await r.json()) as T;
}
export const control = <T = unknown>(path: string, body?: unknown) =>
  request<T>(config.CONTROL_URL, path, body);
export function proof(d: Proof): Proof {
  return { session_id: d.session_id, owner: d.owner, epoch: d.epoch };
}
