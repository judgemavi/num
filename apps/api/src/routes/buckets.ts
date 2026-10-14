import {
  asOfQuerySchema,
  bucketCoverSchema,
  bucketCreateSchema,
  bucketEventCreateSchema,
  bucketEventListSchema,
  bucketEventSchema,
  bucketListQuerySchema,
  bucketListSchema,
  bucketSchema,
  bucketWriteSchema,
  overspentListSchema,
} from "@num/shared";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import type { Db } from "../db";
import { coverBucket, createBucketEvent, listBucketEvents, undoBucketEvent } from "../services/bucket-events";
import { archiveBucket, createBucket, listBuckets, listOverspent, readBucket, restoreBucket, updateBucket } from "../services/buckets";
import { validationHook } from "../validation";
import { errorResponse, idParams } from "./common";

const eventParams = z.object({
  id: z.uuid(),
  eventId: z.uuid(),
});

const listRoute = createRoute({
  operationId: "list_buckets",
  description: "Read buckets. This does not create, change or delete a record. Amounts are integer milliunits: 1000 is one unit of the book currency. Money that enters the account is positive.",
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

const eventsRoute = createRoute({
  operationId: "get_buckets_events",
  description: "Read buckets. This does not create, change or delete a record. Amounts are integer milliunits: 1000 is one unit of the book currency. Money that enters the account is positive.",
  method: "get",
  path: "/api/buckets/events",
  responses: {
    200: {
      description: "Bucket events that still count",
      content: { "application/json": { schema: bucketEventListSchema } },
    },
  },
});

const overspentRoute = createRoute({
  operationId: "get_buckets_overspent",
  description: "Read buckets. This does not create, change or delete a record. Amounts are integer milliunits: 1000 is one unit of the book currency. Money that enters the account is positive.",
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
  description: "Create or run buckets. This does not change records outside this action. Amounts are integer milliunits: 1000 is one unit of the book currency. Money that enters the account is positive.",
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
  description: "Change buckets. This does not change records outside this action. Amounts are integer milliunits: 1000 is one unit of the book currency. Money that enters the account is positive.",
  method: "patch",
  path: "/api/buckets/{id}",
  request: {
    params: idParams,
    body: { required: true, content: { "application/json": { schema: bucketWriteSchema } } },
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
  description: "Remove or archive buckets (archive). This does not change records of another kind. Amounts are integer milliunits: 1000 is one unit of the book currency. Money that enters the account is positive.",
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
  description: "Restore buckets (restore). This does not change records of another kind. Amounts are integer milliunits: 1000 is one unit of the book currency. Money that enters the account is positive.",
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

const eventRoute = createRoute({
  operationId: "post_buckets_id_events",
  description: "Create or run buckets. This does not change records outside this action. Amounts are integer milliunits: 1000 is one unit of the book currency. Money that enters the account is positive.",
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
      content: { "application/json": { schema: bucketEventSchema } },
    },
    400: errorResponse,
    404: errorResponse,
    409: errorResponse,
  },
});

const undoRoute = createRoute({
  operationId: "post_buckets_id_events_eventid_undo",
  description: "Undo buckets (undo). This reverses that change. It does not remove the audit log. Amounts are integer milliunits: 1000 is one unit of the book currency. Money that enters the account is positive.",
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

const coverRoute = createRoute({
  operationId: "post_buckets_id_cover",
  description: "Create or run buckets (cover). This does not change records outside this action. Amounts are integer milliunits: 1000 is one unit of the book currency. Money that enters the account is positive.",
  method: "post",
  path: "/api/buckets/{id}/cover",
  request: {
    params: idParams,
    body: { required: true, content: { "application/json": { schema: bucketCoverSchema } } },
  },
  responses: {
    200: {
      description: "The move that covers the bucket",
      content: { "application/json": { schema: bucketEventSchema } },
    },
    400: errorResponse,
    404: errorResponse,
    409: errorResponse,
  },
});

const readRoute = createRoute({
  operationId: "get_buckets_id",
  description: "Read buckets. This does not create, change or delete a record. Amounts are integer milliunits: 1000 is one unit of the book currency. Money that enters the account is positive.",
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
    .openapi(eventsRoute, (c) => c.json(listBucketEvents(db), 200))
    .openapi(overspentRoute, (c) => c.json(listOverspent(db), 200))
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
    .openapi(eventRoute, (c) => {
      const { id } = c.req.valid("param");
      return c.json(createBucketEvent(db, id, { ...c.req.valid("json"), asOf: c.req.valid("query").asOf, source: "ui" }), 200);
    })
    .openapi(undoRoute, (c) => {
      const { id, eventId } = c.req.valid("param");
      return c.json(undoBucketEvent(db, id, eventId, { source: "ui" }), 200);
    })
    .openapi(coverRoute, (c) => {
      const { id } = c.req.valid("param");
      return c.json(coverBucket(db, id, { ...c.req.valid("json"), source: "ui" }), 200);
    });
}

export type BucketRoutes = ReturnType<typeof bucketRoutes>;
