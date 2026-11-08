import { randomUUID } from "node:crypto";
import { z } from "zod";
const env = z
  .object({
    DATABASE_URL: z.string().min(1),
    CONTROL_URL: z.string().url(),
    GATEWAY_URL: z.string().url(),
    NATS_URL: z.string().default("nats://localhost:4222"),
    NATS_USER: z.string().default("eob"),
    NATS_PASSWORD: z.string().min(1),
    SERVICE_TOKENS: z.string(),
    MODEL_BASE_URL: z.string().url().default("https://api.openai.com/v1"),
    MODEL_NAME: z.string().default("gpt-4.1-mini"),
    MODEL_API_KEY: z.string().default(""),
    EXECUTION_ENABLED: z.enum(["true","false"]).default("true").transform(v=>v==="true"),
    MODEL_TIMEOUT_MS: z.coerce.number().int().positive().default(60000),
    RUNTIME_CONCURRENCY: z.coerce.number().int().positive().default(16),
    LISTEN_ADDR: z.string().default(":8080"),
    LEASE_SECONDS: z.coerce.number().int().min(6).default(30),
  })
  .parse(process.env);
export const config = {
  ...env,
  owner: `${process.env.HOSTNAME ?? "runtime"}-${randomUUID()}`,
  tokens: z
    .record(z.string(), z.string())
    .parse(JSON.parse(env.SERVICE_TOKENS)),
};
