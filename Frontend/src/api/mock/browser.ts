import { setupWorker } from "msw/browser";
import { handlers } from "./handlers";

export const worker = setupWorker(...handlers);
export function startMockBackend() {
  return worker.start({ onUnhandledRequest: "bypass", serviceWorker: { url: "/mockServiceWorker.js" } });
}
