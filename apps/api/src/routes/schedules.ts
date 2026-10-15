import {
  autoLinkResultSchema,
  isoDateSchema,
  occurrenceLinkBodySchema,
  occurrenceLinkSchema,
  occurrenceListSchema,
  occurrenceSkipBodySchema,
  recurringSignalsSchema,
  upcomingListSchema,
} from "@num/shared";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import type { Db } from "../db";
import { linkOccurrence, restoreSkip, skipOccurrence, unlinkOccurrence } from "../services/recurring-links";
import { autoLink, listOccurrences, listUpcoming, recurringSignals } from "../services/recurring-view";
import { validationHook } from "../validation";
import { errorResponse, idParams } from "./common";

const occurrenceParams = z.object({ id: z.uuid(), dueDate: isoDateSchema });
const asOfQuery = z.object({ asOf: isoDateSchema });

const occurrencesRoute = createRoute({
  operationId: "list_occurrences",
  description: "Read recurring schedules of commitments and incomes (occurrences). This does not create, change or delete a record. Amounts are integer milliunits: 1000 is one unit of the book currency. Money that enters the account is positive.",
  method: "get",
  path: "/api/buckets/{id}/occurrences",
  request: { params: idParams, query: asOfQuery },
  responses: {
    200: { description: "Calculated occurrences", content: { "application/json": { schema: occurrenceListSchema } } },
    400: errorResponse,
    404: errorResponse,
  },
});

const linkRoute = createRoute({
  operationId: "post_buckets_id_occurrences_duedate_link",
  description: "Create or run recurring schedules of commitments and incomes (link). This does not change records outside this action. Amounts are integer milliunits: 1000 is one unit of the book currency. Money that enters the account is positive.",
  method: "post",
  path: "/api/buckets/{id}/occurrences/{dueDate}/link",
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
  operationId: "post_buckets_id_occurrences_duedate_unlink",
  description: "Create or run recurring schedules of commitments and incomes (unlink). This does not change records outside this action. Amounts are integer milliunits: 1000 is one unit of the book currency. Money that enters the account is positive.",
  method: "post",
  path: "/api/buckets/{id}/occurrences/{dueDate}/unlink",
  request: { params: occurrenceParams },
  responses: {
    200: { description: "The removed link", content: { "application/json": { schema: occurrenceLinkSchema } } },
    404: errorResponse,
    409: errorResponse,
  },
});

const skipRoute = createRoute({
  operationId: "post_buckets_id_occurrences_duedate_skip",
  description: "Create or run recurring schedules of commitments and incomes (skip). This does not change records outside this action. Amounts are integer milliunits: 1000 is one unit of the book currency. Money that enters the account is positive.",
  method: "post",
  path: "/api/buckets/{id}/occurrences/{dueDate}/skip",
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
  operationId: "post_buckets_id_occurrences_duedate_restore",
  description: "Restore recurring schedules of commitments and incomes (restore). This does not change records of another kind. Amounts are integer milliunits: 1000 is one unit of the book currency. Money that enters the account is positive.",
  method: "post",
  path: "/api/buckets/{id}/occurrences/{dueDate}/restore",
  request: { params: occurrenceParams },
  responses: {
    200: { description: "The restored occurrence", content: { "application/json": { schema: occurrenceLinkSchema } } },
    404: errorResponse,
    409: errorResponse,
  },
});

const autoLinkRoute = createRoute({
  operationId: "post_buckets_auto_link",
  description: "Create or run recurring schedules of commitments and incomes. This does not change records outside this action. Amounts are integer milliunits: 1000 is one unit of the book currency. Money that enters the account is positive.",
  method: "post",
  path: "/api/buckets/auto-link",
  request: { query: asOfQuery },
  responses: {
    200: { description: "Links that were saved", content: { "application/json": { schema: autoLinkResultSchema } } },
    400: errorResponse,
  },
});

const signalsRoute = createRoute({
  operationId: "get_buckets_signals",
  description: "Read recurring schedules of commitments and incomes (signals). This does not create, change or delete a record. Amounts are integer milliunits: 1000 is one unit of the book currency. Money that enters the account is positive.",
  method: "get",
  path: "/api/buckets/signals",
  request: { query: asOfQuery },
  responses: {
    200: { description: "Changed, missed, ambiguous and detected schedules", content: { "application/json": { schema: recurringSignalsSchema } } },
    400: errorResponse,
  },
});

const upcomingRoute = createRoute({
  operationId: "list_upcoming_occurrences",
  description: "Read recurring schedules of commitments and incomes (the occurrences of all active schedules in the next 30 days). This does not create, change or delete a record. Amounts are integer milliunits: 1000 is one unit of the book currency. Money that enters the account is positive.",
  method: "get",
  path: "/api/buckets/upcoming",
  request: { query: asOfQuery },
  responses: {
    200: { description: "Upcoming occurrences", content: { "application/json": { schema: upcomingListSchema } } },
    400: errorResponse,
  },
});

export function scheduleRoutes(db: Db) {
  return new OpenAPIHono({ defaultHook: validationHook })
    .openapi(signalsRoute, (c) => c.json(recurringSignals(db, c.req.valid("query").asOf), 200))
    .openapi(upcomingRoute, (c) => c.json(listUpcoming(db, c.req.valid("query").asOf), 200))
    .openapi(autoLinkRoute, (c) => c.json(autoLink(db, c.req.valid("query").asOf, { source: "ui" }), 200))
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
