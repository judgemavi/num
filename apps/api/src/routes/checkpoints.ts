import {
  checkpointCompareSchema,
  checkpointCreateSchema,
  checkpointListSchema,
  checkpointSchema,
  clearanceResultSchema,
  clearanceSchema,
  closingHintSchema,
  errorSchema,
} from "@num/shared";
import { createRoute, z, type OpenAPIHono } from "@hono/zod-openapi";
import type { Db } from "../db";
import {
  compareCheckpoint,
  createCheckpoint,
  latestClosing,
  listCheckpoints,
  unlockCheckpoint,
} from "../services/checkpoints";
import { setClearance } from "../services/transaction-clearance";

const errorResponse = {
  description: "The request is not valid",
  content: {
    "application/json": {
      schema: errorSchema,
    },
  },
} as const;

const accountParams = z.object({
  id: z.uuid(),
});

const checkpointParams = z.object({
  id: z.uuid(),
  checkpointId: z.uuid(),
});

const listRoute = createRoute({
  method: "get",
  path: "/api/accounts/{id}/checkpoints",
  request: { params: accountParams },
  responses: {
    200: {
      description: "Checkpoints for the account",
      content: { "application/json": { schema: checkpointListSchema } },
    },
    404: errorResponse,
  },
});

const compareRoute = createRoute({
  method: "post",
  path: "/api/accounts/{id}/checkpoints/compare",
  request: {
    params: accountParams,
    body: {
      required: true,
      content: { "application/json": { schema: checkpointCreateSchema } },
    },
  },
  responses: {
    200: {
      description: "The statement balance compared with the book",
      content: { "application/json": { schema: checkpointCompareSchema } },
    },
    400: errorResponse,
    404: errorResponse,
  },
});

const createRouteDef = createRoute({
  method: "post",
  path: "/api/accounts/{id}/checkpoints",
  request: {
    params: accountParams,
    body: {
      required: true,
      content: { "application/json": { schema: checkpointCreateSchema } },
    },
  },
  responses: {
    200: {
      description: "The checkpoint",
      content: { "application/json": { schema: checkpointSchema } },
    },
    400: errorResponse,
    404: errorResponse,
    409: errorResponse,
  },
});

const unlockRoute = createRoute({
  method: "post",
  path: "/api/accounts/{id}/checkpoints/{checkpointId}/unlock",
  request: { params: checkpointParams },
  responses: {
    200: {
      description: "The unlocked checkpoint",
      content: { "application/json": { schema: checkpointSchema } },
    },
    404: errorResponse,
    409: errorResponse,
  },
});

const closingRoute = createRoute({
  method: "get",
  path: "/api/accounts/{id}/closing",
  request: { params: accountParams },
  responses: {
    200: {
      description: "Closing balance from the latest import, when one exists",
      content: { "application/json": { schema: closingHintSchema } },
    },
    404: errorResponse,
  },
});

const clearanceRoute = createRoute({
  method: "post",
  path: "/api/accounts/{id}/clearance",
  request: {
    params: accountParams,
    body: {
      required: true,
      content: { "application/json": { schema: clearanceSchema } },
    },
  },
  responses: {
    200: {
      description: "Transactions marked open or cleared",
      content: { "application/json": { schema: clearanceResultSchema } },
    },
    400: errorResponse,
    404: errorResponse,
    409: errorResponse,
  },
});

export function registerCheckpoints(app: OpenAPIHono, db: Db) {
  app.openapi(listRoute, (c) => c.json(listCheckpoints(db, c.req.valid("param").id), 200));

  app.openapi(compareRoute, (c) => {
    const { id } = c.req.valid("param");
    return c.json(compareCheckpoint(db, id, c.req.valid("json")), 200);
  });

  app.openapi(createRouteDef, (c) => {
    const { id } = c.req.valid("param");
    return c.json(createCheckpoint(db, id, { ...c.req.valid("json"), source: "ui" }), 200);
  });

  app.openapi(unlockRoute, (c) => {
    const { id, checkpointId } = c.req.valid("param");
    return c.json(unlockCheckpoint(db, id, checkpointId, { source: "ui" }), 200);
  });

  app.openapi(closingRoute, (c) => c.json(latestClosing(db, c.req.valid("param").id), 200));

  app.openapi(clearanceRoute, (c) => {
    const { id } = c.req.valid("param");
    return c.json(setClearance(db, id, { ...c.req.valid("json"), source: "ui" }), 200);
  });
}
