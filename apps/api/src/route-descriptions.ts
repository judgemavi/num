import type { OpenAPIHono } from "@hono/zod-openapi";
import { z } from "zod";

type RouteConfig = Parameters<OpenAPIHono["openAPIRegistry"]["registerPath"]>[0];

const moneyText = "Amounts are integer milliunits: 1000 is one unit of the book currency. Money that enters the account is positive.";

function isZodSchema(value: unknown): value is z.ZodType {
  return value instanceof z.ZodType;
}

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
  return typeof media === "object" && media !== null && "schema" in media && isZodSchema(media.schema) ? media.schema : undefined;
}

function routeSchemas(route: RouteConfig) {
  const schemas: z.ZodType[] = [];
  if (route.request?.params) {
    schemas.push(route.request.params);
  }
  if (route.request?.query) {
    schemas.push(route.request.query);
  }
  for (const media of Object.values(route.request?.body?.content ?? {})) {
    const schema = zodSchemaOf(media);
    if (schema) schemas.push(schema);
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

/** OpenAPI and MCP read the same descriptions after all routes are registered. */
export function addMoneyDescriptions(app: OpenAPIHono) {
  for (const definition of app.openAPIRegistry.definitions) {
    if (definition.type !== "route") continue;
    const route = definition.route;
    if (routeHasAmount(routeSchemas(route))) {
      route.description = `${route.description ?? ""} ${moneyText}`.trim();
    }
  }
}
