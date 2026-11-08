import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AppProviders } from "./app/providers";
import { App } from "./app/App";
import "./styles/index.css";

async function bootstrap() {
  if (import.meta.env.VITE_USE_MOCKS !== "false") {
    const { startMockBackend } = await import("./api/mock/browser");
    await startMockBackend();
  }
  createRoot(document.getElementById("root")!).render(<StrictMode><AppProviders><App /></AppProviders></StrictMode>);
}

void bootstrap();
