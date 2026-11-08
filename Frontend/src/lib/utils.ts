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
  if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return; }
  const focused = document.activeElement as HTMLElement | null;
  const input = document.createElement("textarea");
  input.value = text; input.readOnly = true;
  input.style.position = "fixed"; input.style.opacity = "0";
  // Keep the fallback inside Radix's active focus scope, including menu/dialog portals.
  (focused?.closest('[role="menu"], [role="dialog"]') ?? document.body).append(input);
  input.select();
  try { if(!document.execCommand("copy")) throw new Error("浏览器不允许复制，请使用 HTTPS"); }
  finally { input.remove(); focused?.focus({preventScroll:true}); }
}
