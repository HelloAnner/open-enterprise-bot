import { z } from "zod";
import { createId } from "@/lib/utils";

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "/api";

export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiClient<T>(path: string, schema: z.ZodType<T>, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
  if (init.method === "POST" && !headers.has("Idempotency-Key")) headers.set("Idempotency-Key", createId());
  const response = await fetch(`${API_BASE_URL}${path}`, { credentials: "include", ...init, headers });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { message?: string } | null;
    throw new ApiError(body?.message ?? `请求失败（${response.status}）`, response.status);
  }
  const data = response.status === 204 ? undefined : await response.json();
  const result = schema.safeParse(data);
  if (!result.success) throw new ApiError("服务端响应格式不符合接口契约", 502);
  return result.data;
}
