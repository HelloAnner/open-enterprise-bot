import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AppProviders } from "./app/providers";
import { App } from "./app/App";
import "./styles/index.css";

async function bootstrap() {
  // Retire only this app's old mock worker; never clear unrelated browser state.
  if ("serviceWorker" in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    const mocks = registrations.filter((registration) => registration.active?.scriptURL.endsWith("/mockServiceWorker.js"));
    await Promise.all(mocks.map((registration) => registration.unregister()));
    if (mocks.length && navigator.serviceWorker.controller?.scriptURL.endsWith("/mockServiceWorker.js")) {
      window.location.reload();
      return;
    }
  }
  createRoot(document.getElementById("root")!).render(<StrictMode><AppProviders><App /></AppProviders></StrictMode>);
}

void bootstrap();
