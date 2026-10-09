import { auditLog } from "@num/db";
import type { OpenAPIHono } from "@hono/zod-openapi";
import type { CallToolResult } from "@modelcontextprotocol/server";
import { sql } from "drizzle-orm";
import { ZodError } from "zod";
import type { Db } from "../db";
import { aiCanWrite } from "../services/ai-access";
import { checkToken, markApplied, storeProposal } from "../services/proposals";
import { withRead, withTransaction } from "../services/work";
import type { McpRoute } from "./catalog";
import { canonicalPayload, routeRequest } from "./inputs";
import { toolResult } from "./result";

type PreviewRow = {
  entity: string;
  action: string;
  before: unknown;
  after: unknown;
};

function errorResult(code: string, params: Record<string, string> = {}): CallToolResult {
  return { ...toolResult({ code, params }), isError: true };
}

function parseJson(value: string | null): unknown {
  if (value === null) {
    return null;
  }
  return JSON.parse(value);
}

function auditIds(db: Db): Set<string> {
  return new Set(db.select({ id: auditLog.id }).from(auditLog).all().map((row) => row.id));
}

function auditSince(db: Db, ids: Set<string>): PreviewRow[] {
  const rows = db.all<{ id: string; entity: string; action: string; before: string | null; after: string | null }>(
    sql`select id, entity, action, before, after from audit_log order by rowid`,
  );
  return rows
    .filter((row) => !ids.has(row.id))
    .map((row) => ({
      entity: row.entity,
      action: row.action,
      before: parseJson(row.before),
      after: parseJson(row.after),
    }));
}

function groupPreview(rows: PreviewRow[]) {
  const groups: { entity: string; action: string; count: number }[] = [];
  for (const row of rows) {
    const found = groups.find((group) => group.entity === row.entity && group.action === row.action);
    if (found) {
      found.count += 1;
    } else {
      groups.push({ entity: row.entity, action: row.action, count: 1 });
    }
  }
  return { groups, rows };
}

async function responseBody(response: Response): Promise<unknown> {
  const type = response.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    return response.json();
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  return {
    contentType: type,
    contentBase64: Buffer.from(bytes).toString("base64"),
  };
}

function resultRef(body: unknown): string | null {
  if (typeof body !== "object" || body === null || !("id" in body)) {
    return null;
  }
  const id = (body as { id: unknown }).id;
  return typeof id === "string" ? id : null;
}

async function toolBody(response: Response): Promise<CallToolResult> {
  const body = await responseBody(response);
  if (response.status >= 400) {
    if (typeof body === "object" && body !== null && "code" in body) {
      const error = body as { code?: unknown; params?: unknown };
      const params = typeof error.params === "object" && error.params !== null ? (error.params as Record<string, string>) : {};
      return errorResult(typeof error.code === "string" ? error.code : "internal_error", params);
    }
    return errorResult("internal_error");
  }
  return toolResult(typeof body === "object" && body !== null ? (body as Record<string, unknown>) : { value: body });
}

async function runRoute(app: OpenAPIHono, route: McpRoute, args: Record<string, unknown>): Promise<Response> {
  return app.request(routeRequest(route, args));
}

export async function callMcpTool(
  app: OpenAPIHono,
  db: Db,
  route: McpRoute,
  args: Record<string, unknown>,
): Promise<CallToolResult> {
  try {
    if (route.read) {
      const response = await withRead(() => runRoute(app, route, args));
      return toolBody(response);
    }
    if (!aiCanWrite(db)) {
      return errorResult("ai_cannot_write");
    }
    const payload = canonicalPayload(route, args);
    const token = typeof args.token === "string" ? args.token : undefined;
    if (!token) {
      const before = auditIds(db);
      const preview = await withTransaction(db, { auditSource: "mcp", deferUploads: true }, async () => {
        const response = await runRoute(app, route, args);
        return { commit: false, value: { response, rows: auditSince(db, before) } };
      });
      const body = await toolBody(preview.response);
      if (body.isError) {
        return body;
      }
      const stored = storeProposal(db, { kind: route.operationId, payload });
      const data = body.structuredContent ?? {};
      return toolResult({
        preview: groupPreview(preview.rows),
        response: data,
        token: stored.token,
      });
    }
    const check = checkToken(db, token, route.operationId, payload);
    if (!check.ok) {
      return errorResult(check.code);
    }
    const applied = await withTransaction(db, { auditSource: "mcp", deferUploads: false }, async () => {
      const response = await runRoute(app, route, args);
      if (response.status >= 400) {
        return { commit: false, value: response };
      }
      const type = response.headers.get("content-type") ?? "";
      const data = type.includes("application/json") ? await response.clone().json() : null;
      markApplied(db, check.id, resultRef(data));
      return { commit: true, value: response };
    });
    return toolBody(applied);
  } catch (error) {
    if (error instanceof ZodError) {
      return errorResult("invalid_body", { field: String(error.issues[0]?.path[0] ?? "body") });
    }
    throw error;
  }
}
