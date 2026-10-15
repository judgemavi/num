import {
  merchantCreateSchema,
  merchantListQuerySchema,
  merchantListSchema,
  merchantMergeSchema,
  merchantSchema,
  merchantUpdateSchema,
} from "@num/shared";
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import type { Db } from "../db";
import { mergeMerchants } from "../services/merchant-merge";
import { archiveMerchant, createMerchant, getMerchant, listMerchants, restoreMerchant, updateMerchant } from "../services/merchants";
import { validationHook } from "../validation";
import { errorResponse, idParams } from "./common";

const listRoute = createRoute({
  operationId: "list_merchants",
  description: "Read merchants. This does not create, change or delete a record. Amounts are integer milliunits: 1000 is one unit of the book currency. Money that enters the account is positive.",
  method: "get",
  path: "/api/merchants",
  request: { query: merchantListQuerySchema },
  responses: {
    200: { description: "Merchants", content: { "application/json": { schema: merchantListSchema } } },
    400: errorResponse,
  },
});

const createRouteDef = createRoute({
  operationId: "post_merchants",
  description: "Create or run merchants. This does not change records outside this action. Amounts are integer milliunits: 1000 is one unit of the book currency. Money that enters the account is positive.",
  method: "post",
  path: "/api/merchants",
  request: { body: { required: true, content: { "application/json": { schema: merchantCreateSchema } } } },
  responses: {
    200: { description: "The created merchant", content: { "application/json": { schema: merchantSchema } } },
    400: errorResponse,
    404: errorResponse,
    409: errorResponse,
  },
});

const updateRoute = createRoute({
  operationId: "patch_merchants_id",
  description: "Change merchants. Send only the fields that change. A field that you leave out keeps its value. This does not change records outside this action. Amounts are integer milliunits: 1000 is one unit of the book currency. Money that enters the account is positive.",
  method: "patch",
  path: "/api/merchants/{id}",
  request: {
    params: idParams,
    body: { required: true, content: { "application/json": { schema: merchantUpdateSchema } } },
  },
  responses: {
    200: { description: "The updated merchant", content: { "application/json": { schema: merchantSchema } } },
    400: errorResponse,
    404: errorResponse,
    409: errorResponse,
  },
});

const archiveRoute = createRoute({
  operationId: "post_merchants_id_archive",
  description: "Remove or archive merchants (archive). This does not change records of another kind. Amounts are integer milliunits: 1000 is one unit of the book currency. Money that enters the account is positive.",
  method: "post",
  path: "/api/merchants/{id}/archive",
  request: { params: idParams },
  responses: {
    200: { description: "The archived merchant", content: { "application/json": { schema: merchantSchema } } },
    404: errorResponse,
    409: errorResponse,
  },
});

const restoreRoute = createRoute({
  operationId: "post_merchants_id_restore",
  description: "Restore merchants (restore). This does not change records of another kind. Amounts are integer milliunits: 1000 is one unit of the book currency. Money that enters the account is positive.",
  method: "post",
  path: "/api/merchants/{id}/restore",
  request: { params: idParams },
  responses: {
    200: { description: "The restored merchant", content: { "application/json": { schema: merchantSchema } } },
    404: errorResponse,
    409: errorResponse,
  },
});

const mergeRoute = createRoute({
  operationId: "post_merchants_id_merge",
  description: "Create or run merchants (merge). This does not change records outside this action. Amounts are integer milliunits: 1000 is one unit of the book currency. Money that enters the account is positive.",
  method: "post",
  path: "/api/merchants/{id}/merge",
  request: {
    params: idParams,
    body: { required: true, content: { "application/json": { schema: merchantMergeSchema } } },
  },
  responses: {
    200: { description: "The merchant that remains", content: { "application/json": { schema: merchantSchema } } },
    400: errorResponse,
    404: errorResponse,
    409: errorResponse,
  },
});

const readRoute = createRoute({
  operationId: "get_merchants_id",
  description: "Read merchants. This does not create, change or delete a record. Amounts are integer milliunits: 1000 is one unit of the book currency. Money that enters the account is positive.",
  method: "get",
  path: "/api/merchants/{id}",
  request: { params: idParams },
  responses: {
    200: { description: "One merchant", content: { "application/json": { schema: merchantSchema } } },
    404: errorResponse,
  },
});

export function merchantRoutes(db: Db) {
  return new OpenAPIHono({ defaultHook: validationHook })
    .openapi(listRoute, (c) => c.json(listMerchants(db, c.req.valid("query")), 200))
    .openapi(readRoute, (c) => c.json(getMerchant(db, c.req.valid("param").id), 200))
    .openapi(createRouteDef, (c) => c.json(createMerchant(db, { ...c.req.valid("json"), source: "ui" }), 200))
    .openapi(updateRoute, (c) => {
      const { id } = c.req.valid("param");
      return c.json(updateMerchant(db, id, { ...c.req.valid("json"), source: "ui" }), 200);
    })
    .openapi(archiveRoute, (c) => c.json(archiveMerchant(db, c.req.valid("param").id, { source: "ui" }), 200))
    .openapi(restoreRoute, (c) => c.json(restoreMerchant(db, c.req.valid("param").id, { source: "ui" }), 200))
    .openapi(mergeRoute, (c) => {
      const { id } = c.req.valid("param");
      return c.json(mergeMerchants(db, id, c.req.valid("json").targetId, { source: "ui" }), 200);
    });
}
