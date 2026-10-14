import {
  checkpointCompareQuerySchema,
  checkpointCompareSchema,
  checkpointCreateSchema,
  checkpointListSchema,
  checkpointSchema,
} from "@num/shared";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import type { Db } from "../db";
import {
  compareCheckpoint,
  createCheckpoint,
  listCheckpoints,
  unlockCheckpoint,
} from "../services/checkpoints";
import { validationHook } from "../validation";
import { errorResponse } from "./common";

const accountParams = z.object({
  id: z.uuid(),
});

const checkpointParams = z.object({
  id: z.uuid(),
  checkpointId: z.uuid(),
});

const listRoute = createRoute({
  operationId: "get_accounts_id_checkpoints",
  description: "Read the checkpoints of an account and the closing date and balance of the last imported statement (null when no import has them). This does not create, change or delete a record. Amounts are integer milliunits: 1000 is one unit of the book currency. Money that enters the account is positive.",
  method: "get",
  path: "/api/accounts/{id}/checkpoints",
  request: { params: accountParams },
  responses: {
    200: {
      description: "Checkpoints for the account and the closing balance of the last imported statement",
      content: { "application/json": { schema: checkpointListSchema } },
    },
    404: errorResponse,
  },
});

const compareRoute = createRoute({
  operationId: "get_accounts_id_checkpoints_compare",
  description: "Read accounts. This does not create, change or delete a record. Compare a statement balance with the book. Amounts are integer milliunits: 1000 is one unit of the book currency. Money that enters the account is positive.",
  method: "get",
  path: "/api/accounts/{id}/checkpoints/compare",
  request: {
    params: accountParams,
    query: checkpointCompareQuerySchema,
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
  operationId: "post_accounts_id_checkpoints",
  description: "Create or run accounts. This does not change records outside this action. Amounts are integer milliunits: 1000 is one unit of the book currency. Money that enters the account is positive.",
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
  operationId: "post_accounts_id_checkpoints_checkpointid_unlock",
  description: "Create or run accounts. This does not change records outside this action. Amounts are integer milliunits: 1000 is one unit of the book currency. Money that enters the account is positive.",
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

export function checkpointRoutes(db: Db) {
  return new OpenAPIHono({ defaultHook: validationHook })
    .openapi(listRoute, (c) => c.json(listCheckpoints(db, c.req.valid("param").id), 200))
    .openapi(compareRoute, (c) => {
      const { id } = c.req.valid("param");
      return c.json(compareCheckpoint(db, id, c.req.valid("query")), 200);
    })
    .openapi(createRouteDef, (c) => {
      const { id } = c.req.valid("param");
      return c.json(createCheckpoint(db, id, { ...c.req.valid("json"), source: "ui" }), 200);
    })
    .openapi(unlockRoute, (c) => {
      const { id, checkpointId } = c.req.valid("param");
      return c.json(unlockCheckpoint(db, id, checkpointId, { source: "ui" }), 200);
    });
}

export type CheckpointRoutes = ReturnType<typeof checkpointRoutes>;
