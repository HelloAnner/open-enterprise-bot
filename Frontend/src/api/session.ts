import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { apiClient, ApiError } from "./client";

const userSchema = z.object({ id: z.string(), username: z.string(), name: z.string() });
export const sessionKey = ["session"] as const;
export function useCapabilities() { return useQuery({queryKey:["capabilities"], queryFn:()=>apiClient("/capabilities",z.object({execution:z.boolean(),desktop:z.boolean(),model:z.string()})), staleTime:60000}); }
export function useSession() {
  return useQuery({ queryKey: sessionKey, retry: false, refetchInterval: 60000, queryFn: async () => {
    try { return await apiClient("/me", userSchema); }
    catch (error) { if (error instanceof ApiError && error.status === 401) return null; throw error; }
  }});
}
export const login = (username: string, password: string) => apiClient("/login", userSchema, { method: "POST", body: JSON.stringify({ username, password }) });
export async function logout() { await apiClient("/logout", z.undefined(), { method: "POST" }); window.location.reload(); }
