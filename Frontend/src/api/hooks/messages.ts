import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { chatApi } from "@/api/chatApi";
import { queryKeys } from "@/api/queryKeys";
import type { ChatMessage } from "@/domain/chat/types";
import { createId, formatBytes } from "@/lib/utils";
import { useUiStore } from "@/stores/uiStore";

const temporaryMessage = (message: Omit<ChatMessage, "id">) => ({ ...message, id: `optimistic-${createId()}` });

export function useMessagesQuery(botId: string, enabled = true) {
  const client = useQueryClient();
  const receipt = useRef("");
  const query = useQuery({ queryKey: queryKeys.messages(botId), queryFn: ({ signal }) => chatApi.listMessages(botId, signal), enabled, refetchInterval: 10000 });
  const latest = query.data?.filter(message => message.from === "bot").at(-1)?.id;
  useEffect(() => {
    const key = `${botId}:${latest}`;
    if (!enabled || !latest || document.visibilityState !== "visible" || receipt.current === key) return;
    receipt.current = key;
    void chatApi.markRead(botId, latest).then(() => client.invalidateQueries({queryKey:queryKeys.bots,exact:true})).catch(() => { if(receipt.current === key) receipt.current = ""; });
  }, [botId, latest, enabled, query.dataUpdatedAt, client]);
  return query;
}

function useMessageMutation(botId: string) {
  const queryClient = useQueryClient();
  const setTyping = useUiStore((state) => state.setTyping);
  const setTaskPhase = useUiStore((state) => state.setTaskPhase);
  const key = queryKeys.messages(botId);
  const begin = async (message: ChatMessage) => {
    await queryClient.cancelQueries({ queryKey: key });
    const previous = queryClient.getQueryData<ChatMessage[]>(key);
    queryClient.setQueryData<ChatMessage[]>(key, (messages = []) => [...messages, message]);
    setTyping(botId, true);
    return { previous, optimisticId: message.id };
  };
  const fail = (error: Error, context?: { previous?: ChatMessage[] }) => {
    queryClient.setQueryData(key, context?.previous);
    setTyping(botId, false);
    toast.error(error.message);
  };
  const finish = async (result: { userMessage: ChatMessage; replies: ChatMessage[]; pending?: boolean }, optimisticId: string) => {
    setTaskPhase(botId, "thinking");
    queryClient.setQueryData<ChatMessage[]>(key, (messages = []) => messages.map((message) => message.id === optimisticId ? result.userMessage : message));
    for (const reply of result.replies) {
      queryClient.setQueryData<ChatMessage[]>(key, (messages = []) => messages.some((message) => message.id === reply.id) ? messages : [...messages, reply]);
    }
    setTyping(botId, Boolean(result.pending));
    await queryClient.invalidateQueries({ queryKey: ["activity"] });
    await queryClient.invalidateQueries({ queryKey: key });
    await queryClient.invalidateQueries({ queryKey: queryKeys.bots });
  };
  const run = async (message: ChatMessage, request: () => Promise<{ userMessage: ChatMessage; replies: ChatMessage[]; pending?: boolean }>) => {
    const context = await begin(message);
    try {
      const result = await request();
      await finish(result, context.optimisticId);
      return result;
    } catch (error) {
      fail(error as Error, context);
      throw error;
    }
  };
  return { run };
}

export function useSendMessageMutation(botId: string) {
  const mutation = useMessageMutation(botId);
  return useMutation({
    mutationFn: (input: { text: string; replyTo?: string }) => mutation.run(
      temporaryMessage({ kind: "text", from: "user", text: input.text, replyTo: input.replyTo }),
      () => chatApi.sendMessage(botId, input),
    ),
  });
}

export function useUploadMutation(botId: string) {
  const mutation = useMessageMutation(botId);
  return useMutation({
    mutationFn: (file: File) => {
      const isImage = file.type.startsWith("image/");
      const url = URL.createObjectURL(file);
      return mutation.run(
        temporaryMessage(isImage ? { kind: "image", from: "user", images: [url] } : { kind: "file", from: "user", name: file.name, size: formatBytes(file.size), url }),
        () => chatApi.uploadFile(botId, file),
      ).finally(() => URL.revokeObjectURL(url));
    },
  });
}

export function useChoiceMutation(botId: string) {
  const queryClient = useQueryClient();
  const setTyping = useUiStore((state) => state.setTyping);
  const key = queryKeys.messages(botId);
  return useMutation({
    mutationFn: async (input: { messageId: string; optionIndex: number }) => {
      setTyping(botId, true);
      try {
        const result = await chatApi.chooseOption(botId, input);
        queryClient.setQueryData<ChatMessage[]>(key, (messages = []) => [...messages.map((message) => message.id === result.choice.id ? result.choice : message), result.userMessage, ...result.replies]);
        setTyping(botId, Boolean(result.pending));
        await queryClient.invalidateQueries({ queryKey: ["activity"] });
        await queryClient.invalidateQueries({ queryKey: key });
        return result;
      } catch (error) {
        setTyping(botId, false);
        toast.error((error as Error).message);
        throw error;
      }
    },
  });
}

export function useReactionMutation(botId: string) {
  const queryClient = useQueryClient();
  const key = queryKeys.messages(botId);
  return useMutation({
    mutationFn: ({ messageId, reaction }: { messageId: string; reaction: string }) => chatApi.reactToMessage(botId, messageId, reaction),
    onMutate: async ({ messageId, reaction }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<ChatMessage[]>(key);
      queryClient.setQueryData<ChatMessage[]>(key, (messages = []) => messages.map((message) => message.id === messageId ? { ...message, reaction } : message));
      return { previous };
    },
    onError: (error: Error, _, context) => { queryClient.setQueryData(key, context?.previous); toast.error(error.message); },
  });
}

export function useDeleteMessageMutation(botId: string) {
  const queryClient = useQueryClient();
  const key = queryKeys.messages(botId);
  return useMutation({
    mutationFn: (messageId: string) => chatApi.deleteMessage(botId, messageId),
    onMutate: async (messageId) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<ChatMessage[]>(key);
      queryClient.setQueryData<ChatMessage[]>(key, (messages = []) => messages.filter((message) => message.id !== messageId));
      return { previous };
    },
    onError: (error: Error, _, context) => { queryClient.setQueryData(key, context?.previous); toast.error(error.message); },
    onSuccess: () => { toast.success("消息已删除"); void queryClient.invalidateQueries({queryKey:queryKeys.bots,exact:true}); },
  });
}
