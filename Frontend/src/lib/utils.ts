import { clsx } from "clsx";
import { v4 as createUuid } from "uuid";
import type { ClassValue } from "clsx";

export const cn = (...inputs: ClassValue[]) => clsx(inputs);
export const createId = createUuid;

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export async function copyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}
