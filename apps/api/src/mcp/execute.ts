import type { OpenAPIHono } from "@hono/zod-openapi";
import type { CallToolResult } from "@modelcontextprotocol/server";
import { ZodError } from "zod";
import type { Db } from "../db";
import { aiCanWrite } from "../services/ai-access";
import { withMcpAudit } from "../services/write";
import type { McpRoute } from "./catalog";
import { routeRequest } from "./inputs";
import { toolResult } from "./result";

function errorResult(code: string, params: Record<string, string> = {}): CallToolResult {
  return { ...toolResult({ code, params }), isError: true };
}

async function responseBody(response: Response) {
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

export async function callMcpTool(
  app: OpenAPIHono,
  db: Db,
  route: McpRoute,
  args: Record<string, unknown>,
): Promise<CallToolResult> {
  try {
    if (!route.read && !aiCanWrite(db)) {
      return errorResult("ai_cannot_write");
    }
    const response = await withMcpAudit(() => app.request(routeRequest(route, args)));
    return toolBody(response);
  } catch (error) {
    if (error instanceof ZodError) {
      return errorResult("invalid_body", { field: String(error.issues[0]?.path[0] ?? "body") });
    }
    throw error;
  }
}
