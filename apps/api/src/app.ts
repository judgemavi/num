import { OpenAPIHono } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { dataDirectory, type Db } from "./db";
import { registerMcp } from "./mcp/register";
import { accountRoutes } from "./routes/accounts";
import { bucketRoutes } from "./routes/buckets";
import { categoryRoutes } from "./routes/categories";
import { checkpointRoutes } from "./routes/checkpoints";
import { documentRoutes } from "./routes/documents";
import { forecastRoutes } from "./routes/forecast";
import { fundingRoutes } from "./routes/funding";
import { healthRoutes } from "./routes/health";
import { hygieneRoutes } from "./routes/hygiene";
import { importRoutes } from "./routes/imports";
import { inboxRoutes } from "./routes/inbox";
import { insightsRoutes } from "./routes/insights";
import { merchantRoutes } from "./routes/merchants";
import { mortgageRoutes } from "./routes/mortgage";
import { planRoutes } from "./routes/plan";
import { recurringRoutes } from "./routes/recurring";
import { setupRoutes } from "./routes/setup";
import { suggestionRoutes } from "./routes/suggestions";
import { tagRoutes } from "./routes/tags";
import { transactionRoutes } from "./routes/transactions";
import { ServiceError } from "./service-error";
import { validationHook } from "./validation";
import { hasFileExtension, webFile, webIndex } from "./web-files";

export function createApp(db: Db, options: { dataDir?: string } = {}) {
  const base = new OpenAPIHono({
    defaultHook: validationHook,
  });

  base.onError((error, c) => {
    if (error instanceof ServiceError) {
      return c.json({ code: error.code, params: error.params }, error.status);
    }
    if (error instanceof HTTPException) {
      return error.getResponse();
    }
    console.error(error);
    return c.json({ code: "internal_error" as const, params: {} }, 500);
  });

  const dataDir = options.dataDir ?? dataDirectory(undefined);
  const app = base
    .route("/", healthRoutes())
    .route("/", setupRoutes(db))
    .route("/", documentRoutes(db, dataDir))
    .route("/", importRoutes(db, dataDir))
    .route("/", inboxRoutes(db))
    .route("/", accountRoutes(db))
    .route("/", mortgageRoutes(db))
    .route("/", insightsRoutes(db))
    .route("/", checkpointRoutes(db))
    .route("/", bucketRoutes(db))
    .route("/", fundingRoutes(db))
    .route("/", forecastRoutes(db))
    .route("/", hygieneRoutes(db))
    .route("/", planRoutes(db))
    .route("/", categoryRoutes(db))
    .route("/", tagRoutes(db))
    .route("/", merchantRoutes(db))
    .route("/", suggestionRoutes(db))
    .route("/", recurringRoutes(db))
    .route("/", transactionRoutes(db));
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
