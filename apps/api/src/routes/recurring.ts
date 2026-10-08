import {
  autoLinkResultSchema,
  errorSchema,
  isoDateSchema,
  occurrenceLinkBodySchema,
  occurrenceLinkSchema,
  occurrenceListSchema,
  occurrenceSkipBodySchema,
  planCreateSchema,
  planListQuerySchema,
  planListSchema,
  planSchema,
  planUpdateSchema,
  recurringSignalsSchema,
} from "@num/shared";
import { createRoute, z, type OpenAPIHono } from "@hono/zod-openapi";
import type { Db } from "../db";
import { archivePlan, createPlan, listPlans, restorePlan, updatePlan } from "../services/recurring-plans";
import { linkOccurrence, restoreSkip, skipOccurrence, unlinkOccurrence } from "../services/recurring-links";
import { autoLink, listOccurrences, recurringSignals } from "../services/recurring-view";

const errorResponse = {
  description: "The request is not valid",
  content: { "application/json": { schema: errorSchema } },
} as const;

const idParams = z.object({ id: z.uuid() });
const occurrenceParams = z.object({ id: z.uuid(), dueDate: isoDateSchema });
const asOfQuery = z.object({ asOf: isoDateSchema });

const listRoute = createRoute({
  method: "get",
  path: "/api/recurring",
  request: { query: planListQuerySchema },
  responses: {
    200: { description: "Recurring plans", content: { "application/json": { schema: planListSchema } } },
    400: errorResponse,
  },
});

const createRouteDef = createRoute({
  method: "post",
  path: "/api/recurring",
  request: { body: { required: true, content: { "application/json": { schema: planCreateSchema } } } },
  responses: {
    200: { description: "The created plan", content: { "application/json": { schema: planSchema } } },
    400: errorResponse,
    404: errorResponse,
    409: errorResponse,
  },
});

const updateRoute = createRoute({
  method: "patch",
  path: "/api/recurring/{id}",
  request: {
    params: idParams,
    body: { required: true, content: { "application/json": { schema: planUpdateSchema } } },
  },
  responses: {
    200: { description: "The updated plan", content: { "application/json": { schema: planSchema } } },
    400: errorResponse,
    404: errorResponse,
    409: errorResponse,
  },
});

const archiveRoute = createRoute({
  method: "post",
  path: "/api/recurring/{id}/archive",
  request: { params: idParams },
  responses: {
    200: { description: "The archived plan", content: { "application/json": { schema: planSchema } } },
    404: errorResponse,
    409: errorResponse,
  },
});

const restoreRoute = createRoute({
  method: "post",
  path: "/api/recurring/{id}/restore",
  request: { params: idParams },
  responses: {
    200: { description: "The restored plan", content: { "application/json": { schema: planSchema } } },
    404: errorResponse,
    409: errorResponse,
  },
});

const occurrencesRoute = createRoute({
  method: "get",
  path: "/api/recurring/{id}/occurrences",
  request: { params: idParams, query: asOfQuery },
  responses: {
    200: { description: "Calculated occurrences", content: { "application/json": { schema: occurrenceListSchema } } },
    400: errorResponse,
    404: errorResponse,
  },
});

const linkRoute = createRoute({
  method: "post",
  path: "/api/recurring/{id}/occurrences/{dueDate}/link",
  request: {
    params: occurrenceParams,
    body: { required: true, content: { "application/json": { schema: occurrenceLinkBodySchema } } },
  },
  responses: {
    200: { description: "The occurrence link", content: { "application/json": { schema: occurrenceLinkSchema } } },
    400: errorResponse,
    404: errorResponse,
    409: errorResponse,
  },
});

const unlinkRoute = createRoute({
  method: "post",
  path: "/api/recurring/{id}/occurrences/{dueDate}/unlink",
  request: { params: occurrenceParams },
  responses: {
    200: { description: "The removed link", content: { "application/json": { schema: occurrenceLinkSchema } } },
    404: errorResponse,
    409: errorResponse,
  },
});

const skipRoute = createRoute({
  method: "post",
  path: "/api/recurring/{id}/occurrences/{dueDate}/skip",
  request: {
    params: occurrenceParams,
    body: { required: true, content: { "application/json": { schema: occurrenceSkipBodySchema } } },
  },
  responses: {
    200: { description: "The skipped occurrence", content: { "application/json": { schema: occurrenceLinkSchema } } },
    400: errorResponse,
    404: errorResponse,
    409: errorResponse,
  },
});

const restoreSkipRoute = createRoute({
  method: "post",
  path: "/api/recurring/{id}/occurrences/{dueDate}/restore",
  request: { params: occurrenceParams },
  responses: {
    200: { description: "The restored occurrence", content: { "application/json": { schema: occurrenceLinkSchema } } },
    404: errorResponse,
    409: errorResponse,
  },
});

const autoLinkRoute = createRoute({
  method: "post",
  path: "/api/recurring/auto-link",
  request: { query: asOfQuery },
  responses: {
    200: { description: "Links that were saved", content: { "application/json": { schema: autoLinkResultSchema } } },
    400: errorResponse,
  },
});

const signalsRoute = createRoute({
  method: "get",
  path: "/api/recurring/signals",
  request: { query: asOfQuery },
  responses: {
    200: { description: "Changed, missed, ambiguous and detected plans", content: { "application/json": { schema: recurringSignalsSchema } } },
    400: errorResponse,
  },
});

export function registerRecurring(app: OpenAPIHono, db: Db) {
  app.openapi(listRoute, (c) => c.json(listPlans(db, c.req.valid("query")), 200));
  app.openapi(signalsRoute, (c) => c.json(recurringSignals(db, c.req.valid("query").asOf), 200));
  app.openapi(autoLinkRoute, (c) => c.json(autoLink(db, c.req.valid("query").asOf, { source: "ui" }), 200));
  app.openapi(createRouteDef, (c) => c.json(createPlan(db, { ...c.req.valid("json"), source: "ui" }), 200));
  app.openapi(updateRoute, (c) => {
    const { id } = c.req.valid("param");
    return c.json(updatePlan(db, id, { ...c.req.valid("json"), source: "ui" }), 200);
  });
  app.openapi(archiveRoute, (c) => c.json(archivePlan(db, c.req.valid("param").id, { source: "ui" }), 200));
  app.openapi(restoreRoute, (c) => c.json(restorePlan(db, c.req.valid("param").id, { source: "ui" }), 200));
  app.openapi(occurrencesRoute, (c) => {
    const { id } = c.req.valid("param");
    return c.json(listOccurrences(db, id, c.req.valid("query").asOf), 200);
  });
  app.openapi(linkRoute, (c) => {
    const { id, dueDate } = c.req.valid("param");
    const { transactionId } = c.req.valid("json");
    return c.json(linkOccurrence(db, id, dueDate, transactionId, { source: "ui" }), 200);
  });
  app.openapi(unlinkRoute, (c) => {
    const { id, dueDate } = c.req.valid("param");
    return c.json(unlinkOccurrence(db, id, dueDate, { source: "ui" }), 200);
  });
  app.openapi(skipRoute, (c) => {
    const { id, dueDate } = c.req.valid("param");
    return c.json(skipOccurrence(db, id, dueDate, c.req.valid("json").reason, { source: "ui" }), 200);
  });
  app.openapi(restoreSkipRoute, (c) => {
    const { id, dueDate } = c.req.valid("param");
    return c.json(restoreSkip(db, id, dueDate, { source: "ui" }), 200);
  });
}
