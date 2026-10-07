import { OpenAPIHono } from "@hono/zod-openapi";
import { healthRoute } from "./routes/health";
import { validationHook } from "./validation";
import { hasFileExtension, webFile, webIndex } from "./web-files";

export function createApp() {
  const app = new OpenAPIHono({
    defaultHook: validationHook,
  });

  app.openapi(healthRoute, (c) => c.json({ ok: true as const }, 200));

  app.doc("/api/openapi.json", {
    openapi: "3.0.0",
    info: {
      title: "Num",
      version: "0.0.1",
    },
  });

  return app;
}

export function serveWeb<T extends OpenAPIHono>(app: T) {
  app.get("*", async (c) => {
    const pathname = new URL(c.req.url).pathname;
    if (pathname === "/api" || pathname.startsWith("/api/")) {
      return c.notFound();
    }

    const file = await webFile(pathname);
    if (file) {
      return new Response(file);
    }
    if (hasFileExtension(pathname)) {
      return c.notFound();
    }

    const index = webIndex();
    if (!(await index.exists())) {
      return c.notFound();
    }
    return new Response(index);
  });

  return app;
}

export const app = serveWeb(createApp());

export type AppType = typeof app;
