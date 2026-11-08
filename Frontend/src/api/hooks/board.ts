import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { chatApi } from "@/api/chatApi";
import { queryKeys } from "@/api/queryKeys";
import type { BoardColumn } from "@/domain/kanban/types";

export function useBoardQuery(enabled: boolean) {
  return useQuery({ queryKey: queryKeys.board, queryFn: ({ signal }) => chatApi.getBoard(signal), enabled });
}

export function useMoveJobMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ jobId, columnId }: { jobId: string; columnId: string }) => chatApi.moveJob(jobId, columnId),
    onMutate: async ({ jobId, columnId }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.board });
      const previous = queryClient.getQueryData<BoardColumn[]>(queryKeys.board);
      queryClient.setQueryData<BoardColumn[]>(queryKeys.board, (columns = []) => {
        const source = columns.find((column) => column.jobs.some((job) => job.id === jobId));
        const job = source?.jobs.find((item) => item.id === jobId);
        if (!source || !job || source.id === columnId) return columns;
        return columns.map((column) => ({ ...column, jobs: column.id === source.id ? column.jobs.filter((item) => item.id !== jobId) : column.id === columnId ? [...column.jobs, job] : column.jobs }));
      });
      return { previous };
    },
    onError: (error: Error, _, context) => { queryClient.setQueryData(queryKeys.board, context?.previous); toast.error(error.message); },
    onSuccess: (columns) => { queryClient.setQueryData(queryKeys.board, columns); toast.success("看板状态已更新"); },
  });
}
