import { OpenAPIHono } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { dataDirectory, type Db } from "./db";
import { registerMcp } from "./mcp/register";
import { registerAccounts } from "./routes/accounts";
import { registerCheckpoints } from "./routes/checkpoints";
import { registerBuckets } from "./routes/buckets";
import { registerForecast } from "./routes/forecast";
import { registerHygiene } from "./routes/hygiene";
import { registerPlan } from "./routes/plan";
import { registerFunding } from "./routes/funding";
import { registerCategories } from "./routes/categories";
import { registerDocuments } from "./routes/documents";
import { registerImports } from "./routes/imports";
import { registerInbox } from "./routes/inbox";
import { registerInsights } from "./routes/insights";
import { healthRoute } from "./routes/health";
import { registerMerchants } from "./routes/merchants";
import { registerMortgage } from "./routes/mortgage";
import { registerRecurring } from "./routes/recurring";
import { registerSuggestions } from "./routes/suggestions";
import { registerSetup } from "./routes/setup";
import { registerTags } from "./routes/tags";
import { registerTransactions } from "./routes/transactions";
import { ServiceError } from "./service-error";
import { validationHook } from "./validation";
import { hasFileExtension, webFile, webIndex } from "./web-files";

export function createApp(db: Db, options: { dataDir?: string } = {}) {
  const app = new OpenAPIHono({
    defaultHook: validationHook,
  });

  app.onError((error, c) => {
    if (error instanceof ServiceError) {
      return c.json({ code: error.code, params: error.params }, error.status);
    }
    if (error instanceof HTTPException) {
      return error.getResponse();
    }
    console.error(error);
    return c.json({ code: "internal_error" as const, params: {} }, 500);
  });

  app.openapi(healthRoute, (c) => c.json({ ok: true as const }, 200));
  registerSetup(app, db);
  registerDocuments(app, db, options.dataDir ?? dataDirectory(undefined));
  registerImports(app, db, options.dataDir ?? dataDirectory(undefined));
  registerInbox(app, db);
  registerAccounts(app, db);
  registerMortgage(app, db);
  registerInsights(app, db);
  registerCheckpoints(app, db);
  registerBuckets(app, db);
  registerFunding(app, db);
  registerForecast(app, db);
  registerHygiene(app, db);
  registerPlan(app, db);
  registerCategories(app, db);
  registerTags(app, db);
  registerMerchants(app, db);
  registerSuggestions(app, db);
  registerRecurring(app, db);
  registerTransactions(app, db);
  registerMcp(app, db);

  app.doc("/api/openapi.json", {
    openapi: "3.0.0",
    info: {
      title: "Num",
      version: "0.0.1",
    },
  });

  return app;
}

export type AppType = ReturnType<typeof createApp>;

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
