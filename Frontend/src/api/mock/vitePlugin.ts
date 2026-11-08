import { createMiddleware } from "@mswjs/http-middleware";
import type { Connect, Plugin } from "vite";

export function mockApiMiddleware(): Plugin {
  return {
    name: "moss-http-mock-api",
    async configureServer(server) {
      const { handlers } = await server.ssrLoadModule("/src/api/mock/handlers.ts");
      server.middlewares.use((req, _res, next) => {
        const request = req as typeof req & { protocol: string; get: (name: string) => string | undefined; header: (name: string) => string | undefined };
        const get = (name: string) => {
          const value = req.headers[name.toLowerCase()];
          return Array.isArray(value) ? value.join(",") : value;
        };
        request.protocol = "http";
        request.get = get;
        request.header = get;
        next();
      });
      server.middlewares.use(createMiddleware(...handlers) as unknown as Connect.NextHandleFunction);
    },
  };
}
