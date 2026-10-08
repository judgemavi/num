import {
  asOfQuerySchema,
  bucketCoverSchema,
  bucketEventCreateSchema,
  bucketEventListSchema,
  bucketEventSchema,
  bucketListQuerySchema,
  bucketListSchema,
  bucketSchema,
  bucketWriteSchema,
  errorSchema,
  overspentListSchema,
} from "@num/shared";
import { createRoute, z, type OpenAPIHono } from "@hono/zod-openapi";
import type { Db } from "../db";
import { coverBucket, createBucketEvent, listBucketEvents, undoBucketEvent } from "../services/bucket-events";
import { archiveBucket, createBucket, listBuckets, listOverspent, restoreBucket, updateBucket } from "../services/buckets";

const errorResponse = {
  description: "The request is not valid",
  content: {
    "application/json": {
      schema: errorSchema,
    },
  },
} as const;

const idParams = z.object({
  id: z.uuid(),
});

const eventParams = z.object({
  id: z.uuid(),
  eventId: z.uuid(),
});

const listRoute = createRoute({
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
  method: "post",
  path: "/api/buckets",
  request: {
    body: { required: true, content: { "application/json": { schema: bucketWriteSchema } } },
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

export function registerBuckets(app: OpenAPIHono, db: Db) {
  app.openapi(listRoute, (c) => c.json(listBuckets(db, c.req.valid("query")), 200));
  app.openapi(eventsRoute, (c) => c.json(listBucketEvents(db), 200));
  app.openapi(overspentRoute, (c) => c.json(listOverspent(db), 200));
  app.openapi(createRouteDef, (c) => c.json(createBucket(db, { ...c.req.valid("json"), source: "ui" }), 200));
  app.openapi(updateRoute, (c) => {
    const { id } = c.req.valid("param");
    return c.json(updateBucket(db, id, { ...c.req.valid("json"), source: "ui" }), 200);
  });
  app.openapi(archiveRoute, (c) => {
    const { id } = c.req.valid("param");
    return c.json(archiveBucket(db, id, { source: "ui" }), 200);
  });
  app.openapi(restoreRoute, (c) => {
    const { id } = c.req.valid("param");
    return c.json(restoreBucket(db, id, { source: "ui" }), 200);
  });
  app.openapi(eventRoute, (c) => {
    const { id } = c.req.valid("param");
    return c.json(createBucketEvent(db, id, { ...c.req.valid("json"), asOf: c.req.valid("query").asOf, source: "ui" }), 200);
  });
  app.openapi(undoRoute, (c) => {
    const { id, eventId } = c.req.valid("param");
    return c.json(undoBucketEvent(db, id, eventId, { source: "ui" }), 200);
  });
  app.openapi(coverRoute, (c) => {
    const { id } = c.req.valid("param");
    return c.json(coverBucket(db, id, { ...c.req.valid("json"), source: "ui" }), 200);
  });
}
