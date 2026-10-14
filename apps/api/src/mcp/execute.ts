import type { OpenAPIHono } from "@hono/zod-openapi";
import type { CallToolResult } from "@modelcontextprotocol/server";
import { ZodError } from "zod";
import type { Db } from "../db";
import { aiCanWrite } from "../services/ai-access";
import { withMcpAudit } from "../services/write";
import type { McpRoute } from "./catalog";
import { routeRequest } from "./inputs";
import { isRecord, toolResult } from "./result";

function errorResult(code: string, params: Record<string, unknown> = {}): CallToolResult {
  return { ...toolResult({ code, params }), isError: true };
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

async function toolBody(response: Response): Promise<CallToolResult> {
  const body = await responseBody(response);
  if (response.status >= 400) {
    if (isRecord(body) && typeof body.code === "string") {
      return errorResult(body.code, isRecord(body.params) ? body.params : {});
    }
    return errorResult("internal_error");
  }
  return toolResult(isRecord(body) ? body : { value: body });
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
