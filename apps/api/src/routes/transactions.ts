import {
  approveLevelResultSchema,
  approveLevelSchema,
  asOfQuerySchema,
  refundPurchaseListSchema,
  refundPurchaseQuerySchema,
  transactionCreateSchema,
  transactionListApiQuerySchema,
  transactionListSchema,
  transactionReviewListSchema,
  transactionReviewQuerySchema,
  transactionReviewReadSchema,
  transactionSchema,
  transactionUpdateSchema,
} from "@num/shared";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import type { Db } from "../db";
import { ServiceError } from "../service-error";
import { approveFiltered } from "../services/review-approve";
import { listReviewTransactions, listTransactions, transactionReview } from "../services/transaction-list";
import { linkRefundToPurchase } from "../services/refund-answer";
import { listRefundPurchases } from "../services/refund-link";
import { acceptLooksRight, createTransaction, deleteTransaction, getTransaction, updateTransaction } from "../services/transactions";
import { validationHook } from "../validation";
import { errorResponse, idParams } from "./common";

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
      schema: transactionSchema,
    },
  },
} as const;

const refundPurchasesRoute = createRoute({
  operationId: "get_transactions_refund_purchases",
  description: "Read transactions. This does not create, change or delete a record. Amounts are integer milliunits: 1000 is one unit of the book currency. Money that enters the account is positive.",
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

const approveRoute = createRoute({
  operationId: "post_transactions_approve",
  description: "Confirm every Needs review row at one level that matches the filters. Send the count that the person saw. A different count gives a 409. Sure clears the automatic reason. Likely applies the suggestion. One write. This counts as a confirmation.",
  method: "post",
  path: "/api/transactions/approve",
  request: {
    query: asOfQuerySchema,
    body: { required: true, content: { "application/json": { schema: approveLevelSchema } } },
  },
  responses: {
    200: {
      description: "The rows that were confirmed",
      content: { "application/json": { schema: approveLevelResultSchema } },
    },
    400: errorResponse,
    409: errorResponse,
  },
});

const listRoute = createRoute({
  operationId: "search_transactions",
  description: "Read transactions. This does not create, change or delete a record. Amounts are integer milliunits: 1000 is one unit of the book currency. Money that enters the account is positive. With asOf (an ISO date), each row that needs review has its review.",
  method: "get",
  path: "/api/transactions",
  request: {
    query: transactionListApiQuerySchema,
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

const reviewListRoute = createRoute({
  operationId: "search_transactions_review",
  description: "Read the transactions that need review, with the same filters, sort order and pages as search_transactions. Each row has its review. The counts are for all pages. This does not create, change or delete a record. Amounts are integer milliunits: 1000 is one unit of the book currency. Money that enters the account is positive.",
  method: "get",
  path: "/api/transactions/review",
  request: { query: transactionReviewQuerySchema },
  responses: {
    200: {
      description: "One page of the transactions that need review",
      content: { "application/json": { schema: transactionReviewListSchema } },
    },
    400: errorResponse,
  },
});

const reviewReadRoute = createRoute({
  operationId: "get_transactions_id_review",
  description: "Read the review of one transaction: its level, its question and the proposed answer. Null when it does not need review. This does not create, change or delete a record. Amounts are integer milliunits: 1000 is one unit of the book currency. Money that enters the account is positive.",
  method: "get",
  path: "/api/transactions/{id}/review",
  request: { params: idParams, query: asOfQuerySchema },
  responses: {
    200: {
      description: "The review of the transaction",
      content: { "application/json": { schema: transactionReviewReadSchema } },
    },
    400: errorResponse,
  },
});

const looksRightRoute = createRoute({
  operationId: "post_transactions_id_looks_right",
  description: "Create or run transactions. This does not change records outside this action. Amounts are integer milliunits: 1000 is one unit of the book currency. Money that enters the account is positive.",
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

const refundOfRoute = createRoute({
  operationId: "post_transactions_id_refund_of",
  description: "Link a refund to the purchase it returns. This changes only the refund and its automatic label. Amounts are integer milliunits: 1000 is one unit of the book currency. Money that enters the account is positive.",
  method: "post",
  path: "/api/transactions/{id}/refund-of",
  request: {
    params: idParams,
    body: {
      required: true,
      content: { "application/json": { schema: z.object({ purchaseId: z.uuid() }) } },
    },
  },
  responses: {
    200: transactionResponse,
    400: errorResponse,
    404: errorResponse,
    409: errorResponse,
  },
});

const readRoute = createRoute({
  operationId: "get_transactions_id",
  description: "Read transactions. This does not create, change or delete a record. Amounts are integer milliunits: 1000 is one unit of the book currency. Money that enters the account is positive.",
  method: "get",
  path: "/api/transactions/{id}",
  request: { params: idParams },
  responses: {
    200: transactionResponse,
    404: errorResponse,
  },
});

const createRouteDef = createRoute({
  operationId: "post_transactions",
  description: "Create or run transactions. This does not change records outside this action. Amounts are integer milliunits: 1000 is one unit of the book currency. Money that enters the account is positive.",
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
    200: transactionSaveResponse,
    400: errorResponse,
    404: errorResponse,
    409: errorResponse,
  },
});

const updateRoute = createRoute({
  operationId: "patch_transactions_id",
  description: "Change transactions. Send only the fields that change. A field that you leave out keeps its value. null clears a field that can be empty. lines replaces all the lines: when you change the amount, send the lines too. The API checks the fields together on the stored transaction with your changes. answer gives the answer to the Needs review question of the transaction (from get_transactions_id_review): for transfer_pair, one transfer line to the account of otherId links the two transactions, and other lines record not_transfer; for refund_purchase, no refundOfId records not_linked; recurring_ambiguous links the transaction to the occurrence. Other records do not change. Amounts are integer milliunits: 1000 is one unit of the book currency. Money that enters the account is positive.",
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
    200: transactionSaveResponse,
    400: errorResponse,
    404: errorResponse,
    409: errorResponse,
  },
});

const deleteRoute = createRoute({
  operationId: "delete_transactions_id",
  description: "Remove or archive transactions. This does not change records of another kind. Amounts are integer milliunits: 1000 is one unit of the book currency. Money that enters the account is positive.",
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

export function transactionRoutes(db: Db) {
  return new OpenAPIHono({ defaultHook: validationHook })
    .openapi(approveRoute, (c) => {
      const { level, count, ...filter } = c.req.valid("json");
      return c.json(approveFiltered(db, c.req.valid("query").asOf, filter, level, count, { source: "ui" }), 200);
    })
    .openapi(refundPurchasesRoute, (c) => c.json({ items: listRefundPurchases(db, c.req.valid("query")) }, 200))
    .openapi(listRoute, (c) => c.json(listTransactions(db, c.req.valid("query")), 200))
    .openapi(reviewListRoute, (c) => c.json(listReviewTransactions(db, c.req.valid("query")), 200))
    .openapi(reviewReadRoute, (c) => c.json(transactionReview(db, c.req.valid("param").id, c.req.valid("query").asOf), 200))
    .openapi(readRoute, (c) => {
      const { id } = c.req.valid("param");
      const record = getTransaction(db, id);
      if (!record) {
        throw new ServiceError("transaction_not_found", 404);
      }
      return c.json(record, 200);
    })
    .openapi(createRouteDef, (c) => {
      const body = c.req.valid("json");
      return c.json(createTransaction(db, { ...body, source: "ui" }), 200);
    })
    .openapi(looksRightRoute, (c) => {
      const { id } = c.req.valid("param");
      return c.json(acceptLooksRight(db, id, { source: "ui" }), 200);
    })
    .openapi(refundOfRoute, (c) => {
      const { id } = c.req.valid("param");
      const { purchaseId } = c.req.valid("json");
      return c.json(linkRefundToPurchase(db, id, purchaseId, { source: "ui" }), 200);
    })
    .openapi(updateRoute, (c) => {
      const body = c.req.valid("json");
      const { id } = c.req.valid("param");
      return c.json(updateTransaction(db, id, { ...body, source: "ui" }), 200);
    })
    .openapi(deleteRoute, (c) => {
      const { id } = c.req.valid("param");
      return c.json(deleteTransaction(db, id, { source: "ui" }), 200);
    });
}

export type TransactionRoutes = ReturnType<typeof transactionRoutes>;
