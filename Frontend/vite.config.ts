import { fileURLToPath, URL } from "node:url";
import { mockApiMiddleware } from "./src/api/mock/vitePlugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === "remote" ? [mockApiMiddleware()] : [])],
  server: { host: "0.0.0.0", allowedHosts: ["mac-mini-1002"] },
  preview: { host: "0.0.0.0", allowedHosts: ["mac-mini-1002"] },
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          "react-vendor": ["react", "react-dom/client"],
          "ui-primitives": ["@radix-ui/react-alert-dialog", "@radix-ui/react-context-menu", "@radix-ui/react-dialog", "@radix-ui/react-dropdown-menu", "@radix-ui/react-popover", "@radix-ui/react-tooltip"],
          motion: ["motion"],
          icons: ["lucide-react"],
        },
      },
    },
  },
}));
