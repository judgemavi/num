import { Hono } from "hono";
import { hasFileExtension, webFile, webIndex } from "./web-files";

export const app = new Hono();

app.get("/api/health", (c) => c.json({ ok: true as const }));

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

export type AppType = typeof app;
