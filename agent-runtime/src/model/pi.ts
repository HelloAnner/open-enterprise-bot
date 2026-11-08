import { Agent, type AgentTool } from "@earendil-works/pi-agent-core";
import {
  createModels,
  createProvider,
  envApiKeyAuth,
  Type,
  type Model,
} from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { z } from "zod";
import type { Delivery } from "../domain/contracts.js";
import { config } from "../infrastructure/config.js";
import { fenced } from "../infrastructure/storage.js";

const model: Model<"openai-completions"> = {
  id: config.MODEL_NAME,
  name: config.MODEL_NAME,
  provider: "enterprise",
  api: "openai-completions",
  baseUrl: config.MODEL_BASE_URL,
  reasoning: false,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 128000,
  maxTokens: 8192,
};
const models = createModels();
models.setProvider(
  createProvider({
    id: "enterprise",
    auth: { apiKey: envApiKeyAuth("Enterprise model", ["MODEL_API_KEY"]) },
    models: [model],
    api: openAICompletionsApi(),
  }),
);

// Pi owns tool validation, streaming, cancellation and the ReAct loop. No host bash/file tools are loaded.
// Each turn reconstructs its Bot-scoped context from durable state; the logical Session lease stays in Go.
export async function structured<T>(
  d: Delivery,
  schema: z.ZodType<T>,
  system: string,
  input: unknown,
): Promise<T> {
  let result: T | undefined;
  let turns = 0;
  const tool: AgentTool = {
    name: "submit_plan",
    label: "Submit plan",
    description:
      "Submit a validated plan to the owning domain layer. This is NOT execution success.",
    parameters: Type.Unsafe(z.toJSONSchema(schema)),
    execute: async (_id, args) => {
      if (result !== undefined) throw new Error("plan already submitted");
      result = schema.parse(args);
      return {
        content: [
          {
            type: "text",
            text: "Plan recorded; execution will be accepted separately by the control plane.",
          },
        ],
        details: { accepted: true },
        terminate: true,
      };
    },
  };
  const agent = new Agent({
    initialState: {
      systemPrompt:
        system + " 必须调用 submit_plan 提交结果，不要用纯文本冒充工具结果。",
      model,
      tools: [tool],
    },
    sessionId: `${d.session_id}:${d.event.bot_id}`,
    streamFn: (m, c, o) =>
      models.streamSimple(m, c, {
        ...o,
        apiKey: config.MODEL_API_KEY,
        timeoutMs: config.MODEL_TIMEOUT_MS,
        maxRetries: 1,
      }),
    finishTurn: () => (++turns >= 3 ? { action: "end" } : undefined),
  });
  const timer = setTimeout(() => agent.abort(), config.MODEL_TIMEOUT_MS);
  try {
    await agent.prompt(JSON.stringify(input));
    if (agent.state.errorMessage || result === undefined)
      throw new Error(
        agent.state.errorMessage ?? "model did not submit a valid plan",
      );
  } catch (error) {
    throw new Error(`MODEL: ${(error as Error).message}`);
  } finally {
    clearTimeout(timer);
    agent.abort();
  }
  // Storage failures remain retryable; never misreport a failed checkpoint as a model error.
  await fenced(d, async (tx) => {
    await tx.query(
      "INSERT INTO runtime.pi_turns(session_id,event_id,bot_id,transcript) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",
      [
        d.session_id,
        d.event.event_id,
        d.event.bot_id,
        JSON.stringify(agent.state.messages),
      ],
    );
  });
  return result;
}
