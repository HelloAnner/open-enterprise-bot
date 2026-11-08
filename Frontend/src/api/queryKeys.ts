export const queryKeys = {
  bots: ["bots"] as const,
  messages: (botId: string) => ["bots", botId, "messages"] as const,
  board: ["boards", "interview"] as const,
};
