import {
  currencyUpdateSchema,
  errorSchema,
  matchingSettingSchema,
  setupRequestSchema,
  setupResultSchema,
  setupStatusSchema,
} from "@num/shared";
import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";
import type { Db } from "../db";
import { bookCurrency, changeCurrency, changeMatching, matchingSetting, runSetup, setupStatus } from "../services/setup";

const errorResponse = {
  description: "The request is not valid",
  content: {
    "application/json": {
      schema: errorSchema,
    },
  },
} as const;

const setupStatusRoute = createRoute({
  method: "get",
  path: "/api/setup",
  responses: {
    200: {
      description: "Setup status",
      content: {
        "application/json": {
          schema: setupStatusSchema,
        },
      },
    },
  },
});

const setupRoute = createRoute({
  method: "post",
  path: "/api/setup",
  request: {
    body: {
      required: true,
      content: {
        "application/json": {
          schema: setupRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Setup result",
      content: {
        "application/json": {
          schema: setupResultSchema,
        },
      },
    },
    400: errorResponse,
    409: errorResponse,
  },
});

const currencyReadRoute = createRoute({
  method: "get",
  path: "/api/settings/currency",
  responses: {
    200: {
      description: "The book currency",
      content: {
        "application/json": {
          schema: currencyUpdateSchema,
        },
      },
    },
    409: errorResponse,
  },
});

const currencyRoute = createRoute({
  method: "patch",
  path: "/api/settings/currency",
  request: {
    body: {
      required: true,
      content: {
        "application/json": {
          schema: currencyUpdateSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "The book currency",
      content: {
        "application/json": {
          schema: currencyUpdateSchema,
        },
      },
    },
    400: errorResponse,
    409: errorResponse,
  },
});

const matchingReadRoute = createRoute({
  method: "get",
  path: "/api/settings/matching",
  responses: {
    200: {
      description: "When labels become automatic",
      content: { "application/json": { schema: matchingSettingSchema } },
    },
    409: errorResponse,
  },
});

const matchingRoute = createRoute({
  method: "patch",
  path: "/api/settings/matching",
  request: {
    body: { required: true, content: { "application/json": { schema: matchingSettingSchema } } },
  },
  responses: {
    200: {
      description: "When labels become automatic",
      content: { "application/json": { schema: matchingSettingSchema } },
    },
    400: errorResponse,
    409: errorResponse,
  },
});

export function registerSetup(app: OpenAPIHono, db: Db) {
  app.openapi(setupStatusRoute, (c) => c.json(setupStatus(db), 200));

  app.openapi(setupRoute, (c) => {
    const body = c.req.valid("json");
    return c.json(runSetup(db, { ...body, source: "ui" }), 200);
  });

  app.openapi(currencyReadRoute, (c) => c.json(bookCurrency(db), 200));

  app.openapi(currencyRoute, (c) => {
    const body = c.req.valid("json");
    return c.json(changeCurrency(db, { currency: body.currency, source: "ui" }), 200);
  });

  app.openapi(matchingReadRoute, (c) => c.json(matchingSetting(db), 200));

  app.openapi(matchingRoute, (c) => {
    const body = c.req.valid("json");
    return c.json(changeMatching(db, { autoConfidence: body.autoConfidence, source: "ui" }), 200);
  });
}
