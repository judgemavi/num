import {
  errorSchema,
  refundPurchaseListSchema,
  refundPurchaseQuerySchema,
  transactionListQuerySchema,
  transactionListSchema,
  skippedRowSchema,
  transactionSchema,
  transactionWriteSchema,
} from "@num/shared";
import { createRoute, z, type OpenAPIHono } from "@hono/zod-openapi";
import type { Db } from "../db";
import { ServiceError } from "../service-error";
import { listTransactions } from "../services/transaction-list";
import { listRefundPurchases } from "../services/refund-link";
import { acceptLooksRight, createTransaction, deleteTransaction, getTransaction, updateTransaction } from "../services/transactions";

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

const transactionSaveSchema = transactionSchema.extend({
  applied: z.number().int().nonnegative().optional(),
  skipped: z.array(skippedRowSchema).optional(),
});

const transactionResponse = {
  description: "The transaction and its lines",
  content: {
    "application/json": {
      schema: transactionSchema,
    },
  },
} as const;

const transactionSaveResponse = {
  description: "The saved transaction",
  content: {
    "application/json": {
      schema: transactionSaveSchema,
    },
  },
} as const;

const refundPurchasesRoute = createRoute({
  method: "get",
  path: "/api/transactions/refund-purchases",
  request: { query: refundPurchaseQuerySchema },
  responses: {
    200: {
      description: "Recent spending a refund can link to",
      content: { "application/json": { schema: refundPurchaseListSchema } },
    },
    400: errorResponse,
  },
});

const listRoute = createRoute({
  method: "get",
  path: "/api/transactions",
  request: {
    query: transactionListQuerySchema,
  },
  responses: {
    200: {
      description: "One page of transactions",
      content: {
        "application/json": {
          schema: transactionListSchema,
        },
      },
    },
    400: errorResponse,
  },
});

const looksRightRoute = createRoute({
  method: "post",
  path: "/api/transactions/{id}/looks-right",
  request: { params: idParams },
  responses: {
    200: transactionResponse,
    400: errorResponse,
    404: errorResponse,
    409: errorResponse,
  },
});

const readRoute = createRoute({
  method: "get",
  path: "/api/transactions/{id}",
  request: { params: idParams },
  responses: {
    200: transactionResponse,
    404: errorResponse,
  },
});

const createRouteDef = createRoute({
  method: "post",
  path: "/api/transactions",
  request: {
    body: {
      required: true,
      content: {
        "application/json": {
          schema: transactionWriteSchema,
        },
      },
    },
  },
  responses: {
    200: transactionSaveResponse,
    400: errorResponse,
    404: errorResponse,
    409: errorResponse,
  },
});

const updateRoute = createRoute({
  method: "patch",
  path: "/api/transactions/{id}",
  request: {
    params: idParams,
    body: {
      required: true,
      content: {
        "application/json": {
          schema: transactionWriteSchema,
        },
      },
    },
  },
  responses: {
    200: transactionSaveResponse,
    400: errorResponse,
    404: errorResponse,
    409: errorResponse,
  },
});

const deleteRoute = createRoute({
  method: "delete",
  path: "/api/transactions/{id}",
  request: { params: idParams },
  responses: {
    200: {
      description: "The deleted transaction",
      content: {
        "application/json": {
          schema: transactionSchema,
        },
      },
    },
    404: errorResponse,
    409: errorResponse,
  },
});

export function registerTransactions(app: OpenAPIHono, db: Db) {
  app.openapi(refundPurchasesRoute, (c) => c.json({ items: listRefundPurchases(db, c.req.valid("query")) }, 200));
  app.openapi(listRoute, (c) => c.json(listTransactions(db, c.req.valid("query")), 200));

  app.openapi(readRoute, (c) => {
    const { id } = c.req.valid("param");
    const record = getTransaction(db, id);
    if (!record || record.deletedAt !== null) {
      throw new ServiceError("transaction_not_found", 404);
    }
    return c.json(record, 200);
  });

  app.openapi(createRouteDef, (c) => {
    const body = c.req.valid("json");
    return c.json(createTransaction(db, { ...body, source: "ui" }), 200);
  });

  app.openapi(looksRightRoute, (c) => {
    const { id } = c.req.valid("param");
    return c.json(acceptLooksRight(db, id, { source: "ui" }), 200);
  });

  app.openapi(updateRoute, (c) => {
    const body = c.req.valid("json");
    const { id } = c.req.valid("param");
    return c.json(updateTransaction(db, id, { ...body, source: "ui" }), 200);
  });

  app.openapi(deleteRoute, (c) => {
    const { id } = c.req.valid("param");
    return c.json(deleteTransaction(db, id, { source: "ui" }), 200);
  });
}
