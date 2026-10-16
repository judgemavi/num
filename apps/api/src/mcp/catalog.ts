import type { OpenAPIHono } from "@hono/zod-openapi";
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import type { Db } from "../db";
import { aiCanWrite } from "../services/ai-access";
import { callMcpTool } from "./execute";
import { fileInputSchema, fieldKeys, isFileSchema, isZodSchema, shapeOf } from "./inputs";
import { isRecord, publishedSchema } from "./result";

const moneyText = "Amounts are integer milliunits: 1000 is one unit of the book currency. Money that enters the account is positive.";

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
  schemas: z.ZodType[];
  multipart: boolean;
};

const methods = new Set(["get", "post", "put", "patch", "delete"]);

type RouteConfig = Parameters<OpenAPIHono["openAPIRegistry"]["registerPath"]>[0];

/** The schemas inside a schema: the fields of an object, the item of an array, the options of a union and the wrapped schema. */
function innerSchemas(schema: z.ZodType): z.ZodType[] {
  if (schema instanceof z.ZodObject) {
    return Object.values(schema.shape);
  }
  if (schema instanceof z.ZodArray) {
    return [schema.element].filter(isZodSchema);
  }
  if (schema instanceof z.ZodUnion) {
    return schema.options.filter(isZodSchema);
  }
  if (schema instanceof z.ZodPipe) {
    return [schema.in, schema.out].filter(isZodSchema);
  }
  const def = schema.def;
  return "innerType" in def && isZodSchema(def.innerType) ? [def.innerType] : [];
}

function schemaHasAmount(schema: z.ZodType, seen: WeakSet<object>): boolean {
  if (seen.has(schema)) {
    return false;
  }
  seen.add(schema);
  if (schema.meta()?.money === true) {
    return true;
  }
  return innerSchemas(schema).some((inner) => schemaHasAmount(inner, seen));
}

function zodSchemaOf(media: unknown): z.ZodType | undefined {
  return isRecord(media) && isZodSchema(media.schema) ? media.schema : undefined;
}

function routeSchemas(route: RouteConfig, body: z.ZodType | undefined) {
  const schemas: z.ZodType[] = [];
  if (route.request?.params) {
    schemas.push(route.request.params);
  }
  if (route.request?.query) {
    schemas.push(route.request.query);
  }
  if (body) {
    schemas.push(body);
  }
  for (const response of Object.values(route.responses)) {
    const content = "content" in response ? Object.values(response.content ?? {}) : [];
    schemas.push(...content.map(zodSchemaOf).filter(isZodSchema));
  }
  return schemas;
}

function routeHasAmount(schemas: z.ZodType[]) {
  const seen = new WeakSet<object>();
  return schemas.some((schema) => schemaHasAmount(schema, seen));
}

function isMethod(value: string): value is McpRoute["method"] {
  return methods.has(value);
}

function bodyOf(route: RouteConfig): { schema?: z.ZodType; multipart: boolean } {
  for (const [type, media] of Object.entries(route.request?.body?.content ?? {})) {
    const schema = zodSchemaOf(media);
    if (schema) {
      return { schema, multipart: type.includes("multipart") || type.includes("form-data") };
    }
  }
  return { multipart: false };
}

const destructiveOperations = new Set([
  "delete_accounts_id_bank_balances_balanceid",
  "delete_category_groups_id",
  "delete_documents_id",
  "delete_transactions_id",
  "patch_accounts_id",
  "post_accounts",
  "post_accounts_id_archive",
  "post_accounts_id_bank_balances",
  "post_accounts_id_restore",
  "post_buckets_id_events_eventid_undo",
  "post_funding_fill",
  "post_imports",
  "post_imports_id_undo",
  "post_imports_rows_id_resolve",
  "post_review_decisions_undo",
  "post_transactions_approve",
  "put_accounts_id_bank_balances_balanceid",
]);

export function mcpRoutes(app: OpenAPIHono): McpRoute[] {
  const routes: McpRoute[] = [];
  const names = new Set<string>();
  for (const definition of app.openAPIRegistry.definitions) {
    if (definition.type !== "route") {
      continue;
    }
    const route = definition.route;
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
      destructive: destructiveOperations.has(route.operationId),
      params: route.request?.params,
      query: route.request?.query,
      body: body.schema,
      schemas: routeSchemas(route, body.schema),
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
  if (!(body instanceof z.ZodUnion) || fieldKeys(body).length === 0) {
    return undefined;
  }
  const branches = body.options.map((option) => {
    if (!(option instanceof z.ZodObject)) {
      throw new Error(`MCP body schema for ${route.operationId} must be an object`);
    }
    return option.extend(extra);
  });
  const [first, ...rest] = branches;
  if (!first) {
    throw new Error(`MCP body schema for ${route.operationId} has no options`);
  }
  if (body instanceof z.ZodDiscriminatedUnion) {
    return z.discriminatedUnion(body.def.discriminator, [first, ...rest]);
  }
  return z.union(branches);
}

function inputSchema(route: McpRoute) {
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

function toolDescription(route: McpRoute) {
  const base = route.description;
  if (!routeHasAmount(route.schemas)) {
    return base;
  }
  return `${base} ${moneyText}`;
}

export function buildToolCatalog(app: OpenAPIHono) {
  return mcpRoutes(app).map((route) => ({
    route,
    config: {
      description: toolDescription(route),
      inputSchema: inputSchema(route),
      annotations: {
        readOnlyHint: route.read,
        destructiveHint: route.destructive,
        idempotentHint: route.read,
        openWorldHint: false,
      },
    },
  }));
}

export function registerGeneratedTools(server: McpServer, app: OpenAPIHono, db: Db, catalog: ReturnType<typeof buildToolCatalog>): void {
  const writes = aiCanWrite(db);
  for (const { route, config } of catalog) {
    if (!route.read && !writes) continue;
    server.registerTool(route.operationId, config, async (args) => callMcpTool(app, db, route, args));
  }
}
