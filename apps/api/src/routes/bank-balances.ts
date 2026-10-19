import {
  bankBalanceInputSchema,
  bankBalanceListSchema,
  bankBalanceSchema,
  bankStatusListSchema,
} from "@num/shared";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import type { Db } from "../db";
import {
  createBankBalance,
  deleteBankBalance,
  listBankBalances,
  listBankStatuses,
  updateBankBalance,
} from "../services/bank-balances";
import { validationHook } from "../validation";
import { errorResponse, idParams } from "./common";

const balanceParams = z.object({
  id: z.uuid(),
  balanceId: z.uuid(),
});


const statusRoute = createRoute({
  operationId: "get_bank_balances_status",
  description: `Read the latest bank balance of each account that has one, and the cleared balance of the account on its date. The cleared balance counts only cleared transactions; open transactions do not count. A difference of 0 means that Num agrees with the bank. This does not create, change or delete a record.`,
  method: "get",
  path: "/api/bank-balances/status",
  responses: {
    200: {
      description: "The status of each account that has a bank balance",
      content: { "application/json": { schema: bankStatusListSchema } },
    },
  },
});

const listRoute = createRoute({
  operationId: "get_accounts_id_bank_balances",
  description: `Read the bank balances of an account and its status (the latest bank balance against the cleared balance on its date; open transactions do not count). This does not create, change or delete a record.`,
  method: "get",
  path: "/api/accounts/{id}/bank-balances",
  request: { params: idParams },
  responses: {
    200: {
      description: "The bank balances and the status of the account",
      content: { "application/json": { schema: bankBalanceListSchema } },
    },
    404: errorResponse,
  },
});

const createRouteDef = createRoute({
  operationId: "post_accounts_id_bank_balances",
  description: `Save a balance that the bank shows on a date. The app saves it also when it is not equal to the cleared balance. An account has one bank balance for each date.`,
  method: "post",
  path: "/api/accounts/{id}/bank-balances",
  request: {
    params: idParams,
    body: { required: true, content: { "application/json": { schema: bankBalanceInputSchema } } },
  },
  responses: {
    200: {
      description: "The bank balance",
      content: { "application/json": { schema: bankBalanceSchema } },
    },
    400: errorResponse,
    404: errorResponse,
    409: errorResponse,
  },
});

const updateRoute = createRoute({
  operationId: "put_accounts_id_bank_balances_balanceid",
  description: `Change the date and the balance of a bank balance.`,
  method: "put",
  path: "/api/accounts/{id}/bank-balances/{balanceId}",
  request: {
    params: balanceParams,
    body: { required: true, content: { "application/json": { schema: bankBalanceInputSchema } } },
  },
  responses: {
    200: {
      description: "The bank balance",
      content: { "application/json": { schema: bankBalanceSchema } },
    },
    400: errorResponse,
    404: errorResponse,
    409: errorResponse,
  },
});

const deleteRoute = createRoute({
  operationId: "delete_accounts_id_bank_balances_balanceid",
  description: `Delete a bank balance.`,
  method: "delete",
  path: "/api/accounts/{id}/bank-balances/{balanceId}",
  request: { params: balanceParams },
  responses: {
    200: {
      description: "The deleted bank balance",
      content: { "application/json": { schema: bankBalanceSchema } },
    },
    404: errorResponse,
  },
});

export function bankBalanceRoutes(db: Db) {
  return new OpenAPIHono({ defaultHook: validationHook })
    .openapi(statusRoute, (c) => c.json(listBankStatuses(db), 200))
    .openapi(listRoute, (c) => c.json(listBankBalances(db, c.req.valid("param").id), 200))
    .openapi(createRouteDef, (c) => {
      const { id } = c.req.valid("param");
      return c.json(createBankBalance(db, id, { ...c.req.valid("json"), source: "ui" }), 200);
    })
    .openapi(updateRoute, (c) => {
      const { id, balanceId } = c.req.valid("param");
      return c.json(updateBankBalance(db, id, balanceId, { ...c.req.valid("json"), source: "ui" }), 200);
    })
    .openapi(deleteRoute, (c) => {
      const { id, balanceId } = c.req.valid("param");
      return c.json(deleteBankBalance(db, id, balanceId, { source: "ui" }), 200);
    });
}
