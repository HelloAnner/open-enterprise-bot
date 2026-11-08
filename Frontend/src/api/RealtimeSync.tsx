import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { API_BASE_URL, apiClient } from "./client";
import { queryKeys } from "./queryKeys";
import { useUiStore } from "@/stores/uiStore";

const activitySchema = z.array(
  z.object({ botId: z.string(), phase: z.enum(["working", "thinking"]) }),
);

// Transport and query invalidation stay outside page components. Reconnect always reloads durable state.
export function RealtimeSync() {
  const client = useQueryClient();
  const activity = useQuery({
    queryKey: ["activity"],
    queryFn: ({ signal }) => apiClient("/activity", activitySchema, { signal }),
    refetchInterval: 2000,
  });
  useEffect(() => {
    if (!activity.data) return;
    const phases = Object.fromEntries(
      activity.data.map(({ botId, phase }) => [botId, phase]),
    );
    useUiStore.setState({
      taskPhases: phases,
      typingBotIds: Object.keys(phases),
    });
  }, [activity.data]);
  useEffect(() => {
    const events = new EventSource(`${API_BASE_URL}/events`, {
      withCredentials: true,
    });
    const refresh = () => {
      void client.invalidateQueries({ queryKey: queryKeys.bots, exact: true });
      void client.invalidateQueries({ queryKey: ["activity"] });
    };
    events.addEventListener("ready", () => { refresh(); void client.invalidateQueries({ queryKey: queryKeys.bots }); });
    events.onmessage = event => { refresh(); try { const data = JSON.parse(event.data) as {botId?: string}; if(data.botId) void client.invalidateQueries({queryKey:queryKeys.messages(data.botId)}); } catch { void client.invalidateQueries({queryKey:queryKeys.bots}); } };
    return () => events.close();
  }, [client]);
  return null;
}
