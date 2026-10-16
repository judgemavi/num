import {
  accountCreateSchema,
  accountListQuerySchema,
  accountListSchema,
  accountSchema,
  accountUpdateSchema,
  archiveAccountSchema,
} from "@num/shared";
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import type { Db } from "../db";
import { archiveAccount, createAccount, getAccount, listAccounts, restoreAccount, updateAccount } from "../services/accounts";
import { validationHook } from "../validation";
import { errorResponse, idParams } from "./common";

const listRoute = createRoute({
  operationId: "list_accounts",
  description: "Read accounts. This does not create, change or delete a record.",
  method: "get",
  path: "/api/accounts",
  request: {
    query: accountListQuerySchema,
  },
  responses: {
    200: {
      description: "Accounts and balances",
      content: {
        "application/json": {
          schema: accountListSchema,
        },
      },
    },
    400: errorResponse,
  },
});

const createRouteDef = createRoute({
  operationId: "post_accounts",
  description: "Create or run accounts. This does not change records outside this action. For a mortgage, the same call saves the mortgage terms (mortgageTerms). null removes the terms. Terms need an opening date and make it fixed.",
  method: "post",
  path: "/api/accounts",
  request: {
    body: {
      required: true,
      content: {
        "application/json": {
          schema: accountCreateSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "The created account",
      content: {
        "application/json": {
          schema: accountSchema,
        },
      },
    },
    400: errorResponse,
  },
});

const updateRoute = createRoute({
  operationId: "patch_accounts_id",
  description: "Change accounts. Send only the fields that change. A field that you leave out keeps its value. null clears a field that can be empty. The API checks the fields together on the stored account with your changes. This does not change records outside this action. For a mortgage, the same call saves the mortgage terms (mortgageTerms). null removes the terms. Terms need an opening date and make it fixed: to change the opening date or the opening balance of a mortgage with terms, send the terms too.",
  method: "patch",
  path: "/api/accounts/{id}",
  request: {
    params: idParams,
    body: {
      required: true,
      content: {
        "application/json": {
          schema: accountUpdateSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "The updated account",
      content: {
        "application/json": {
          schema: accountSchema,
        },
      },
    },
    400: errorResponse,
    404: errorResponse,
  },
});

const restoreRoute = createRoute({
  operationId: "post_accounts_id_restore",
  description: "Restore accounts (restore). This does not change records of another kind.",
  method: "post",
  path: "/api/accounts/{id}/restore",
  request: { params: idParams },
  responses: {
    200: {
      description: "The restored account",
      content: {
        "application/json": {
          schema: accountSchema,
        },
      },
    },
    404: errorResponse,
    409: errorResponse,
  },
});

const readRoute = createRoute({
  operationId: "get_accounts_id",
  description: "Read accounts. This does not create, change or delete a record.",
  method: "get",
  path: "/api/accounts/{id}",
  request: { params: idParams },
  responses: {
    200: {
      description: "One account and its balance",
      content: {
        "application/json": {
          schema: accountSchema,
        },
      },
    },
    404: errorResponse,
  },
});

const archiveRoute = createRoute({
  operationId: "post_accounts_id_archive",
  description: "Remove or archive accounts (archive). This does not change records of another kind.",
  method: "post",
  path: "/api/accounts/{id}/archive",
  request: {
    params: idParams,
    body: {
      required: true,
      content: {
        "application/json": {
          schema: archiveAccountSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "The archived account",
      content: {
        "application/json": {
          schema: accountSchema,
        },
      },
    },
    400: errorResponse,
    404: errorResponse,
    409: errorResponse,
  },
});

export function accountRoutes(db: Db) {
  return new OpenAPIHono({ defaultHook: validationHook })
    .openapi(listRoute, (c) => c.json(listAccounts(db, c.req.valid("query")), 200))
    .openapi(readRoute, (c) => {
      const { id } = c.req.valid("param");
      return c.json(getAccount(db, id), 200);
    })
    .openapi(createRouteDef, (c) => {
      const body = c.req.valid("json");
      return c.json(createAccount(db, { ...body, source: "ui" }), 200);
    })
    .openapi(updateRoute, (c) => {
      const body = c.req.valid("json");
      const { id } = c.req.valid("param");
      return c.json(updateAccount(db, id, { ...body, source: "ui" }), 200);
    })
    .openapi(archiveRoute, (c) => {
      const body = c.req.valid("json");
      const { id } = c.req.valid("param");
      return c.json(archiveAccount(db, id, { confirm: body.confirm, source: "ui" }), 200);
    })
    .openapi(restoreRoute, (c) => {
      const { id } = c.req.valid("param");
      return c.json(restoreAccount(db, id, { source: "ui" }), 200);
    });
}
