import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { chatApi } from "@/api/chatApi";
import type { BotPatch, BotWriteInput } from "@/api/chatApi";
import { queryKeys } from "@/api/queryKeys";
import type { Bot } from "@/domain/bot/types";
import { useUiStore } from "@/stores/uiStore";

export function useBotsQuery() {
  return useQuery({ queryKey: queryKeys.bots, queryFn: ({ signal }) => chatApi.listBots(signal) });
}

export function useSaveBotMutation() {
  const queryClient = useQueryClient();
  const selectBot = useUiStore((state) => state.selectBot);
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: BotWriteInput }) => id ? chatApi.updateBot(id, input) : chatApi.createBot(input),
    onSuccess: (bot, variables) => {
      queryClient.setQueryData<Bot[]>(queryKeys.bots, (bots = []) => variables.id ? bots.map((item) => item.id === bot.id ? bot : item) : [...bots, bot]);
      if (!variables.id) selectBot(bot.id);
      void queryClient.invalidateQueries({ queryKey: queryKeys.bots });
    },
  });
}

export function usePatchBotMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: BotPatch }) => chatApi.updateBot(id, patch),
    onSuccess: (bot) => {
      queryClient.setQueryData<Bot[]>(queryKeys.bots, (bots = []) => bots.map((item) => item.id === bot.id ? bot : item));
      void queryClient.invalidateQueries({ queryKey: queryKeys.bots });
    },
  });
}

export function useDeleteBotMutation() {
  const queryClient = useQueryClient();
  const selectBot = useUiStore((state) => state.selectBot);
  return useMutation({
    mutationFn: chatApi.deleteBot,
    onSuccess: (_, id) => {
      queryClient.setQueryData<Bot[]>(queryKeys.bots, (bots = []) => bots.filter((bot) => bot.id !== id));
      queryClient.removeQueries({ queryKey: queryKeys.messages(id) });
      if (useUiStore.getState().activeBotId === id) selectBot("");
      void queryClient.invalidateQueries({ queryKey: queryKeys.bots });
    },
  });
}
