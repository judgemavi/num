import {
  asOfQuerySchema,
  bucketCreateSchema,
  bucketEventCreateSchema,
  bucketEventSchema,
  manualBucketEventSchema,
  bucketListQuerySchema,
  bucketListSchema,
  bucketSchema,
  bucketUpdateSchema,
  billNeedListSchema,
  emergencyFundSchema,
  overspentListSchema,
} from "@num/shared";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import type { Db } from "../db";
import { createBucketEvent, undoBucketEvent } from "../services/bucket-events";
import { listBillNeeds } from "../services/bills";
import { pauseBucket, resumeBucket } from "../services/bucket-pause";
import { readEmergencyFund } from "../services/emergency-fund";
import { archiveBucket, createBucket, listBuckets, listOverspent, readBucket, restoreBucket, updateBucket } from "../services/buckets";
import { validationHook } from "../validation";
import { errorResponse, idParams } from "./common";

const eventParams = z.object({
  id: z.uuid(),
  eventId: z.uuid(),
});

const listRoute = createRoute({
  operationId: "list_buckets",
  description: "Read buckets: the bills (kind commitment, with a schedule, also yearly bills), the incomes, the spending buckets, the savings (sinking, goal) and the emergency fund, each with its balance. A bill or a sinking bucket that holds money for a yearly payment explains a month with a large payment. This does not create, change or delete a record.",
  method: "get",
  path: "/api/buckets",
  request: { query: bucketListQuerySchema },
  responses: {
    200: {
      description: "Buckets and balances",
      content: { "application/json": { schema: bucketListSchema } },
    },
    400: errorResponse,
  },
});

const emergencyRoute = createRoute({
  operationId: "get_buckets_emergency",
  description: "Read the emergency fund bucket: its balance, the months to keep, the monthly essential spending and the target (months times monthly). basis history: monthly is the median essential spending of the last 6 complete months. basis plan: there are fewer than 3 such months, thus monthly is the yearly amount / 12 of the essential bills plus the refills of the essential spending buckets. This does not create, change or delete a record.",
  method: "get",
  path: "/api/buckets/emergency",
  request: { query: asOfQuerySchema },
  responses: {
    200: {
      description: "The emergency fund and its calculation, or null when the book has no emergency bucket",
      content: { "application/json": { schema: emergencyFundSchema.nullable() } },
    },
    400: errorResponse,
  },
});

const billsRoute = createRoute({
  operationId: "get_buckets_bills",
  description: "Read the next payment of each active commitment (bill), in fill order: its due date, its amount (the sum of the payments of that month when it is due more than one time a month), the gap (the part that the balance does not hold when it is due in the next 30 days), the part of the gap that Unassigned covers in fill order (covered) and the rest (short). The next payment is the earliest occurrence that is not skipped, not linked and whose window has not ended on asOf. This does not create, change or delete a record.",
  method: "get",
  path: "/api/buckets/bills",
  request: { query: asOfQuerySchema },
  responses: {
    200: {
      description: "The next payment of each bill",
      content: { "application/json": { schema: billNeedListSchema } },
    },
    400: errorResponse,
  },
});

const overspentRoute = createRoute({
  operationId: "get_buckets_overspent",
  description: "Read buckets. This does not create, change or delete a record.",
  method: "get",
  path: "/api/buckets/overspent",
  responses: {
    200: {
      description: "Buckets with a negative balance",
      content: { "application/json": { schema: overspentListSchema } },
    },
  },
});

const createRouteDef = createRoute({
  operationId: "post_buckets",
  description: "Create or run buckets. A commitment or an income bucket has a schedule (its payments or deposits on a calendar) in the field schedule. Other kinds have schedule null. This does not change records outside this action.",
  method: "post",
  path: "/api/buckets",
  request: {
    query: asOfQuerySchema,
    body: { required: true, content: { "application/json": { schema: bucketCreateSchema } } },
  },
  responses: {
    200: {
      description: "The created bucket",
      content: { "application/json": { schema: bucketSchema } },
    },
    400: errorResponse,
    404: errorResponse,
    409: errorResponse,
  },
});

const updateRoute = createRoute({
  operationId: "patch_buckets_id",
  description: "Change buckets. Send only the fields that change. A schedule replaces the stored schedule as a whole. A field that you leave out keeps its value. null clears a field that can be empty. The API checks the fields together on the stored record with your changes. This does not change records outside this action.",
  method: "patch",
  path: "/api/buckets/{id}",
  request: {
    params: idParams,
    body: { required: true, content: { "application/json": { schema: bucketUpdateSchema } } },
  },
  responses: {
    200: {
      description: "The updated bucket",
      content: { "application/json": { schema: bucketSchema } },
    },
    400: errorResponse,
    404: errorResponse,
    409: errorResponse,
  },
});

const archiveRoute = createRoute({
  operationId: "post_buckets_id_archive",
  description: "Remove or archive buckets (archive). This does not change records of another kind.",
  method: "post",
  path: "/api/buckets/{id}/archive",
  request: { params: idParams },
  responses: {
    200: {
      description: "The archived bucket",
      content: { "application/json": { schema: bucketSchema } },
    },
    404: errorResponse,
    409: errorResponse,
  },
});

const restoreRoute = createRoute({
  operationId: "post_buckets_id_restore",
  description: "Restore buckets (restore). This does not change records of another kind.",
  method: "post",
  path: "/api/buckets/{id}/restore",
  request: { params: idParams },
  responses: {
    200: {
      description: "The restored bucket",
      content: { "application/json": { schema: bucketSchema } },
    },
    404: errorResponse,
    409: errorResponse,
  },
});

const pauseRoute = createRoute({
  operationId: "post_buckets_id_pause",
  description: "Pause buckets (pause). A paused bucket keeps its balance. The fill does not fund it: its monthly amount is 0. An income cannot be paused. This does not change records of another kind.",
  method: "post",
  path: "/api/buckets/{id}/pause",
  request: { params: idParams },
  responses: {
    200: {
      description: "The paused bucket",
      content: { "application/json": { schema: bucketSchema } },
    },
    404: errorResponse,
    409: errorResponse,
  },
});

const resumeRoute = createRoute({
  operationId: "post_buckets_id_resume",
  description: "Resume buckets (resume). The fill funds the bucket again. This does not change records of another kind.",
  method: "post",
  path: "/api/buckets/{id}/resume",
  request: { params: idParams },
  responses: {
    200: {
      description: "The resumed bucket",
      content: { "application/json": { schema: bucketSchema } },
    },
    404: errorResponse,
    409: errorResponse,
  },
});

const eventRoute = createRoute({
  operationId: "post_buckets_id_events",
  description: "Create or run buckets. This does not change records outside this action.",
  method: "post",
  path: "/api/buckets/{id}/events",
  request: {
    params: idParams,
    query: asOfQuerySchema,
    body: { required: true, content: { "application/json": { schema: bucketEventCreateSchema } } },
  },
  responses: {
    200: {
      description: "The created event",
      content: { "application/json": { schema: manualBucketEventSchema } },
    },
    400: errorResponse,
    404: errorResponse,
    409: errorResponse,
  },
});

const undoRoute = createRoute({
  operationId: "post_buckets_id_events_eventid_undo",
  description: "Undo buckets (undo). This reverses that change. It does not remove the audit log.",
  method: "post",
  path: "/api/buckets/{id}/events/{eventId}/undo",
  request: { params: eventParams },
  responses: {
    200: {
      description: "The undone event",
      content: { "application/json": { schema: bucketEventSchema } },
    },
    404: errorResponse,
    409: errorResponse,
  },
});

const readRoute = createRoute({
  operationId: "get_buckets_id",
  description: "Read buckets. This does not create, change or delete a record.",
  method: "get",
  path: "/api/buckets/{id}",
  request: { params: idParams },
  responses: {
    200: { description: "One bucket and its balance", content: { "application/json": { schema: bucketSchema } } },
    404: errorResponse,
  },
});

export function bucketRoutes(db: Db) {
  return new OpenAPIHono({ defaultHook: validationHook })
    .openapi(listRoute, (c) => c.json(listBuckets(db, c.req.valid("query")), 200))
    .openapi(overspentRoute, (c) => c.json(listOverspent(db), 200))
    .openapi(billsRoute, (c) => c.json(listBillNeeds(db, c.req.valid("query").asOf), 200))
    .openapi(emergencyRoute, (c) => c.json(readEmergencyFund(db, c.req.valid("query").asOf), 200))
    .openapi(readRoute, (c) => c.json(readBucket(db, c.req.valid("param").id), 200))
    .openapi(createRouteDef, (c) =>
      c.json(createBucket(db, { ...c.req.valid("json"), asOf: c.req.valid("query").asOf, source: "ui" }), 200),
    )
    .openapi(updateRoute, (c) => {
      const { id } = c.req.valid("param");
      return c.json(updateBucket(db, id, { ...c.req.valid("json"), source: "ui" }), 200);
    })
    .openapi(archiveRoute, (c) => {
      const { id } = c.req.valid("param");
      return c.json(archiveBucket(db, id, { source: "ui" }), 200);
    })
    .openapi(restoreRoute, (c) => {
      const { id } = c.req.valid("param");
      return c.json(restoreBucket(db, id, { source: "ui" }), 200);
    })
    .openapi(pauseRoute, (c) => {
      const { id } = c.req.valid("param");
      return c.json(pauseBucket(db, id, { source: "ui" }), 200);
    })
    .openapi(resumeRoute, (c) => {
      const { id } = c.req.valid("param");
      return c.json(resumeBucket(db, id, { source: "ui" }), 200);
    })
    .openapi(eventRoute, (c) => {
      const { id } = c.req.valid("param");
      return c.json(createBucketEvent(db, id, { ...c.req.valid("json"), asOf: c.req.valid("query").asOf, source: "ui" }), 200);
    })
    .openapi(undoRoute, (c) => {
      const { id, eventId } = c.req.valid("param");
      return c.json(undoBucketEvent(db, id, eventId, { source: "ui" }), 200);
    });
}
