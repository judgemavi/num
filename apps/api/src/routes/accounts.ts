import {
  accountCreateSchema,
  accountListQuerySchema,
  accountListSchema,
  accountSchema,
  accountUpdateSchema,
  archiveAccountSchema,
  errorSchema,
  openingSuggestionSchema,
} from "@num/shared";
import { createRoute, z, type OpenAPIHono } from "@hono/zod-openapi";
import type { Db } from "../db";
import { applyOpeningSuggestion, archiveAccount, createAccount, getAccount, listAccounts, restoreAccount, updateAccount } from "../services/accounts";

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

const listRoute = createRoute({
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

const openingRoute = createRoute({
  method: "post",
  path: "/api/accounts/{id}/opening",
  request: {
    params: idParams,
    body: {
      required: true,
      content: {
        "application/json": {
          schema: openingSuggestionSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "The account after the opening balance is set",
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

export function registerAccounts(app: OpenAPIHono, db: Db) {
  app.openapi(listRoute, (c) => c.json(listAccounts(db, c.req.valid("query")), 200));

  app.openapi(readRoute, (c) => {
    const { id } = c.req.valid("param");
    return c.json(getAccount(db, id), 200);
  });

  app.openapi(createRouteDef, (c) => {
    const body = c.req.valid("json");
    return c.json(createAccount(db, { ...body, source: "ui" }), 200);
  });

  app.openapi(updateRoute, (c) => {
    const body = c.req.valid("json");
    const { id } = c.req.valid("param");
    return c.json(updateAccount(db, id, { ...body, source: "ui" }), 200);
  });

  app.openapi(archiveRoute, (c) => {
    const body = c.req.valid("json");
    const { id } = c.req.valid("param");
    return c.json(archiveAccount(db, id, { confirm: body.confirm, source: "ui" }), 200);
  });

  app.openapi(restoreRoute, (c) => {
    const { id } = c.req.valid("param");
    return c.json(restoreAccount(db, id, { source: "ui" }), 200);
  });

  app.openapi(openingRoute, (c) => {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    return c.json(applyOpeningSuggestion(db, id, { amount: body.amount, date: body.date, source: "ui" }), 200);
  });
}
