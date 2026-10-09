import type { OpenAPIHono } from "@hono/zod-openapi";
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import type { Db } from "../db";
import { aiCanWrite } from "../services/ai-access";
import { callMcpTool } from "./execute";
import { fieldKeys, isFileSchema, shapeOf } from "./inputs";
import { publishedSchema } from "./result";

const moneyText = "Amounts are integer minor units. Money that enters the account is positive.";

const fileInputSchema = z
  .union([
    z.object({
      filename: z.string(),
      mimeType: z.string().optional(),
      text: z.string(),
    }),
    z.object({
      filename: z.string(),
      mimeType: z.string().optional(),
      contentBase64: z.string(),
    }),
  ])
  .describe("The file as text or as base64. Use text for a CSV.");

export type McpRoute = {
  method: "get" | "post" | "put" | "patch" | "delete";
  path: string;
  operationId: string;
  description: string;
  read: boolean;
  destructive: boolean;
  params?: z.ZodType;
  query?: z.ZodType;
  body?: z.ZodType;
  multipart: boolean;
};

type RouteConfig = {
  method: string;
  path: string;
  operationId?: string;
  description?: string;
  request?: {
    params?: z.ZodType;
    query?: z.ZodType;
    body?: { content?: Record<string, { schema?: z.ZodType }> };
  };
};

const methods = new Set(["get", "post", "put", "patch", "delete"]);

function isMethod(value: string): value is McpRoute["method"] {
  return methods.has(value);
}

function bodyOf(route: RouteConfig): { schema?: z.ZodType; multipart: boolean } {
  const content = route.request?.body?.content;
  if (!content) {
    return { multipart: false };
  }
  const entry = Object.entries(content).find(([, value]) => value.schema);
  if (!entry) {
    return { multipart: false };
  }
  return { schema: entry[1].schema, multipart: entry[0].includes("multipart") || entry[0].includes("form-data") };
}

export function isDestructive(method: string, path: string): boolean {
  if (method === "get") {
    return false;
  }
  const text = path.toLowerCase();
  return (
    method === "delete" ||
    text.endsWith("/delete") ||
    text.includes("undo") ||
    text.includes("/import") ||
    text.includes("/funding") ||
    text.includes("checkpoint") ||
    text.startsWith("/api/accounts")
  );
}

export function mcpRoutes(app: OpenAPIHono): McpRoute[] {
  const routes: McpRoute[] = [];
  const names = new Set<string>();
  for (const definition of app.openAPIRegistry.definitions) {
    if (definition.type !== "route") {
      continue;
    }
    const route = definition.route as RouteConfig;
    if (!isMethod(route.method)) {
      throw new Error(`MCP method is not supported for ${route.path}`);
    }
    if (!route.operationId) {
      throw new Error(`MCP operationId is missing for ${route.method.toUpperCase()} ${route.path}`);
    }
    if (!route.description) {
      throw new Error(`MCP description is missing for ${route.operationId}`);
    }
    if (names.has(route.operationId)) {
      throw new Error(`MCP operationId is duplicated: ${route.operationId}`);
    }
    names.add(route.operationId);
    const body = bodyOf(route);
    routes.push({
      method: route.method,
      path: route.path,
      operationId: route.operationId,
      description: route.description,
      read: route.method === "get",
      destructive: isDestructive(route.method, route.path),
      params: route.request?.params,
      query: route.request?.query,
      body: body.schema,
      multipart: body.multipart,
    });
  }
  return routes;
}

function addFields(fields: Record<string, z.ZodType>, schema: z.ZodType | undefined, route: McpRoute) {
  for (const [key, value] of Object.entries(shapeOf(schema))) {
    if (key in fields) {
      throw new Error(`MCP input field ${key} is repeated on ${route.operationId}`);
    }
    fields[key] = route.multipart && isFileSchema(value) ? fileInputSchema : value;
  }
}

function unionSchema(route: McpRoute, extra: Record<string, z.ZodType>): z.ZodType | undefined {
  const body = route.body;
  if (!body || fieldKeys(body).length === 0 || Object.keys(shapeOf(body)).length > 0) {
    return undefined;
  }
  const options = "options" in body ? (body as { options?: z.ZodType[] }).options : undefined;
  if (!options || options.some((option) => Object.keys(shapeOf(option)).length === 0)) {
    throw new Error(`MCP body schema for ${route.operationId} must be an object`);
  }
  const branches = options.map((option) => (option as z.ZodObject).extend(extra));
  const discriminator = (body as { def?: { discriminator?: unknown } }).def?.discriminator;
  if (typeof discriminator === "string" && branches.length >= 2) {
    return z.discriminatedUnion(discriminator, branches as [z.ZodObject, z.ZodObject, ...z.ZodObject[]]);
  }
  return z.union(branches as unknown as [z.ZodType, z.ZodType, ...z.ZodType[]]);
}

function inputSchema(route: McpRoute): z.ZodType {
  const fields: Record<string, z.ZodType> = {};
  addFields(fields, route.params, route);
  addFields(fields, route.query, route);
  const union = unionSchema(route, fields);
  if (union) {
    return publishedSchema(union);
  }
  addFields(fields, route.body, route);
  return publishedSchema(z.object(fields));
}

function toolDescription(route: McpRoute): string {
  if (route.description.includes("minor units")) {
    return route.description;
  }
  return `${route.description} ${moneyText}`;
}

export function registerGeneratedTools(server: McpServer, app: OpenAPIHono, db: Db): void {
  const writes = aiCanWrite(db);
  for (const route of mcpRoutes(app)) {
    if (!route.read && !writes) {
      continue;
    }
    server.registerTool(
      route.operationId,
      {
        description: toolDescription(route),
        inputSchema: inputSchema(route),
        annotations: {
          readOnlyHint: route.read,
          destructiveHint: route.destructive,
          idempotentHint: route.read,
          openWorldHint: false,
        },
      },
      async (args) => callMcpTool(app, db, route, args as Record<string, unknown>),
    );
  }
}
