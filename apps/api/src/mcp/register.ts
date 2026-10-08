import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import type { OpenAPIHono } from "@hono/zod-openapi";
import type { Db } from "../db";
import { registerReadTools } from "./read-tools";

function createReadServer(db: Db) {
  const server = new McpServer(
    { name: "num", version: "0.0.1" },
    {
      instructions:
        "Num is a personal finance ledger. Amounts are integer minor units. Dates are ISO 8601 calendar dates. Tools that need today's date require asOf. Results are codes, integers and ISO strings.",
    },
  );
  registerReadTools(server, db);
  return server;
}

export function registerMcp(app: OpenAPIHono, db: Db) {
  const handler = createMcpHandler(() => createReadServer(db));
  app.all("/mcp", (c) => handler.fetch(c.req.raw));
}
