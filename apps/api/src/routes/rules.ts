import {
  errorSchema,
  ruleApplyPreviewSchema,
  ruleCreateSchema,
  ruleListQuerySchema,
  ruleListSchema,
  ruleSchema,
  ruleUpdateSchema,
} from "@num/shared";
import { createRoute, z, type OpenAPIHono } from "@hono/zod-openapi";
import type { Db } from "../db";
import { applyRule, previewRuleApply } from "../services/rule-apply";
import { archiveRule, createRule, listRules, restoreRule, updateRule } from "../services/rules";

const errorResponse = {
  description: "The request is not valid",
  content: { "application/json": { schema: errorSchema } },
} as const;

const idParams = z.object({ id: z.uuid() });

const listRoute = createRoute({
  method: "get",
  path: "/api/rules",
  request: { query: ruleListQuerySchema },
  responses: {
    200: { description: "Rules", content: { "application/json": { schema: ruleListSchema } } },
    400: errorResponse,
  },
});

const createRouteDef = createRoute({
  method: "post",
  path: "/api/rules",
  request: { body: { required: true, content: { "application/json": { schema: ruleCreateSchema } } } },
  responses: {
    200: { description: "The created rule", content: { "application/json": { schema: ruleSchema } } },
    400: errorResponse,
    404: errorResponse,
    409: errorResponse,
  },
});

const updateRoute = createRoute({
  method: "patch",
  path: "/api/rules/{id}",
  request: {
    params: idParams,
    body: { required: true, content: { "application/json": { schema: ruleUpdateSchema } } },
  },
  responses: {
    200: { description: "The updated rule", content: { "application/json": { schema: ruleSchema } } },
    400: errorResponse,
    404: errorResponse,
    409: errorResponse,
  },
});

const archiveRoute = createRoute({
  method: "post",
  path: "/api/rules/{id}/archive",
  request: { params: idParams },
  responses: {
    200: { description: "The archived rule", content: { "application/json": { schema: ruleSchema } } },
    404: errorResponse,
    409: errorResponse,
  },
});

const restoreRoute = createRoute({
  method: "post",
  path: "/api/rules/{id}/restore",
  request: { params: idParams },
  responses: {
    200: { description: "The restored rule", content: { "application/json": { schema: ruleSchema } } },
    404: errorResponse,
    409: errorResponse,
  },
});

const previewRoute = createRoute({
  method: "get",
  path: "/api/rules/{id}/preview",
  request: { params: idParams },
  responses: {
    200: { description: "Transactions the rule would change", content: { "application/json": { schema: ruleApplyPreviewSchema } } },
    404: errorResponse,
    409: errorResponse,
  },
});

const applyRoute = createRoute({
  method: "post",
  path: "/api/rules/{id}/apply",
  request: { params: idParams },
  responses: {
    200: { description: "Transactions the rule changed", content: { "application/json": { schema: ruleApplyPreviewSchema } } },
    404: errorResponse,
    409: errorResponse,
  },
});

export function registerRules(app: OpenAPIHono, db: Db) {
  app.openapi(listRoute, (c) => c.json(listRules(db, c.req.valid("query")), 200));
  app.openapi(createRouteDef, (c) => c.json(createRule(db, { ...c.req.valid("json"), source: "ui" }), 200));
  app.openapi(updateRoute, (c) => {
    const { id } = c.req.valid("param");
    return c.json(updateRule(db, id, { ...c.req.valid("json"), source: "ui" }), 200);
  });
  app.openapi(archiveRoute, (c) => c.json(archiveRule(db, c.req.valid("param").id, { source: "ui" }), 200));
  app.openapi(restoreRoute, (c) => c.json(restoreRule(db, c.req.valid("param").id, { source: "ui" }), 200));
  app.openapi(previewRoute, (c) => c.json(previewRuleApply(db, c.req.valid("param").id), 200));
  app.openapi(applyRoute, (c) => c.json(applyRule(db, c.req.valid("param").id, { source: "ui" }), 200));
}
