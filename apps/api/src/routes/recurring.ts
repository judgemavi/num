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
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import type { Db } from "../db";
import { archivePlan, createPlan, getPlan, listPlans, restorePlan, updatePlan } from "../services/recurring-plans";
import { linkOccurrence, restoreSkip, skipOccurrence, unlinkOccurrence } from "../services/recurring-links";
import { autoLink, listOccurrences, recurringSignals } from "../services/recurring-view";
import { validationHook } from "../validation";

const errorResponse = {
  description: "The request is not valid",
  content: { "application/json": { schema: errorSchema } },
} as const;

const idParams = z.object({ id: z.uuid() });
const occurrenceParams = z.object({ id: z.uuid(), dueDate: isoDateSchema });
const asOfQuery = z.object({ asOf: isoDateSchema });

const listRoute = createRoute({
  operationId: "list_plans",
  description: "Read recurring plans. This does not create, change or delete a record. Amounts are integer minor units. Money that enters the account is positive.",
  method: "get",
  path: "/api/recurring",
  request: { query: planListQuerySchema },
  responses: {
    200: { description: "Recurring plans", content: { "application/json": { schema: planListSchema } } },
    400: errorResponse,
  },
});

const createRouteDef = createRoute({
  operationId: "post_recurring",
  description: "Create or run recurring plans. This does not change records outside this action. Amounts are integer minor units. Money that enters the account is positive.",
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
  operationId: "patch_recurring_id",
  description: "Change recurring plans. This does not change records outside this action. Amounts are integer minor units. Money that enters the account is positive.",
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
  operationId: "post_recurring_id_archive",
  description: "Remove or archive recurring plans (archive). This does not change records of another kind. Amounts are integer minor units. Money that enters the account is positive.",
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
  operationId: "post_recurring_id_restore",
  description: "Restore recurring plans (restore). This does not change records of another kind. Amounts are integer minor units. Money that enters the account is positive.",
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
  operationId: "list_occurrences",
  description: "Read recurring plans (occurrences). This does not create, change or delete a record. Amounts are integer minor units. Money that enters the account is positive.",
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
  operationId: "post_recurring_id_occurrences_duedate_link",
  description: "Create or run recurring plans (link). This does not change records outside this action. Amounts are integer minor units. Money that enters the account is positive.",
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
  operationId: "post_recurring_id_occurrences_duedate_unlink",
  description: "Create or run recurring plans (unlink). This does not change records outside this action. Amounts are integer minor units. Money that enters the account is positive.",
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
  operationId: "post_recurring_id_occurrences_duedate_skip",
  description: "Create or run recurring plans (skip). This does not change records outside this action. Amounts are integer minor units. Money that enters the account is positive.",
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
  operationId: "post_recurring_id_occurrences_duedate_restore",
  description: "Restore recurring plans (restore). This does not change records of another kind. Amounts are integer minor units. Money that enters the account is positive.",
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
  operationId: "post_recurring_auto_link",
  description: "Create or run recurring plans. This does not change records outside this action. Amounts are integer minor units. Money that enters the account is positive.",
  method: "post",
  path: "/api/recurring/auto-link",
  request: { query: asOfQuery },
  responses: {
    200: { description: "Links that were saved", content: { "application/json": { schema: autoLinkResultSchema } } },
    400: errorResponse,
  },
});

const signalsRoute = createRoute({
  operationId: "get_recurring_signals",
  description: "Read recurring plans (signals). This does not create, change or delete a record. Amounts are integer minor units. Money that enters the account is positive.",
  method: "get",
  path: "/api/recurring/signals",
  request: { query: asOfQuery },
  responses: {
    200: { description: "Changed, missed, ambiguous and detected plans", content: { "application/json": { schema: recurringSignalsSchema } } },
    400: errorResponse,
  },
});

const readRoute = createRoute({
  operationId: "get_recurring_id",
  description: "Read recurring plans. This does not create, change or delete a record. Amounts are integer minor units. Money that enters the account is positive.",
  method: "get",
  path: "/api/recurring/{id}",
  request: { params: idParams },
  responses: {
    200: { description: "One recurring plan", content: { "application/json": { schema: planSchema } } },
    404: errorResponse,
  },
});

export function recurringRoutes(db: Db) {
  return new OpenAPIHono({ defaultHook: validationHook })
    .openapi(listRoute, (c) => c.json(listPlans(db, c.req.valid("query")), 200))
    .openapi(signalsRoute, (c) => c.json(recurringSignals(db, c.req.valid("query").asOf), 200))
    .openapi(readRoute, (c) => c.json(getPlan(db, c.req.valid("param").id), 200))
    .openapi(autoLinkRoute, (c) => c.json(autoLink(db, c.req.valid("query").asOf, { source: "ui" }), 200))
    .openapi(createRouteDef, (c) => c.json(createPlan(db, { ...c.req.valid("json"), source: "ui" }), 200))
    .openapi(updateRoute, (c) => {
      const { id } = c.req.valid("param");
      return c.json(updatePlan(db, id, { ...c.req.valid("json"), source: "ui" }), 200);
    })
    .openapi(archiveRoute, (c) => c.json(archivePlan(db, c.req.valid("param").id, { source: "ui" }), 200))
    .openapi(restoreRoute, (c) => c.json(restorePlan(db, c.req.valid("param").id, { source: "ui" }), 200))
    .openapi(occurrencesRoute, (c) => {
      const { id } = c.req.valid("param");
      return c.json(listOccurrences(db, id, c.req.valid("query").asOf), 200);
    })
    .openapi(linkRoute, (c) => {
      const { id, dueDate } = c.req.valid("param");
      const { transactionId } = c.req.valid("json");
      return c.json(linkOccurrence(db, id, dueDate, transactionId, { source: "ui" }), 200);
    })
    .openapi(unlinkRoute, (c) => {
      const { id, dueDate } = c.req.valid("param");
      return c.json(unlinkOccurrence(db, id, dueDate, { source: "ui" }), 200);
    })
    .openapi(skipRoute, (c) => {
      const { id, dueDate } = c.req.valid("param");
      return c.json(skipOccurrence(db, id, dueDate, c.req.valid("json").reason, { source: "ui" }), 200);
    })
    .openapi(restoreSkipRoute, (c) => {
      const { id, dueDate } = c.req.valid("param");
      return c.json(restoreSkip(db, id, dueDate, { source: "ui" }), 200);
    });
}

export type RecurringRoutes = ReturnType<typeof recurringRoutes>;
