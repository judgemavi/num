import { errorSchema, transactionCreateSchema, transactionSchema, transactionUpdateSchema } from "@num/shared";
import { createRoute, z, type OpenAPIHono } from "@hono/zod-openapi";
import type { Db } from "../db";
import { createTransaction, deleteTransaction, updateTransaction } from "../services/transactions";

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

const transactionResponse = {
  description: "The transaction and its lines",
  content: {
    "application/json": {
      schema: transactionSchema,
    },
  },
} as const;

const createRouteDef = createRoute({
  method: "post",
  path: "/api/transactions",
  request: {
    body: {
      required: true,
      content: {
        "application/json": {
          schema: transactionCreateSchema,
        },
      },
    },
  },
  responses: {
    200: transactionResponse,
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
          schema: transactionUpdateSchema,
        },
      },
    },
  },
  responses: {
    200: transactionResponse,
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
  app.openapi(createRouteDef, (c) => {
    const body = c.req.valid("json");
    return c.json(createTransaction(db, { ...body, source: "ui" }), 200);
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
