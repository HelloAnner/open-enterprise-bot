import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
  plugins: [react()],
  server: { host: "0.0.0.0", allowedHosts: ["mac-mini-1002"], proxy: {
    "/api": { target: env.API_PROXY_TARGET || "http://localhost:8080" },
    "/desktop": { target: env.DESKTOP_PROXY_TARGET || "http://localhost:8083", ws: true },
  } },
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
};
});
