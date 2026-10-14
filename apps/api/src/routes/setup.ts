import {
  aiAccessSettingSchema,
  currencyUpdateSchema,
  matchingSettingSchema,
  setupRequestSchema,
  setupResultSchema,
  setupStatusSchema,
} from "@num/shared";
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import type { Db } from "../db";
import { aiCanWrite, changeAiAccess } from "../services/ai-access";
import { bookCurrency, changeCurrency, changeMatching, matchingSetting, runSetup, setupStatus } from "../services/setup";
import { validationHook } from "../validation";
import { errorResponse } from "./common";

const setupStatusRoute = createRoute({
  operationId: "get_setup",
  description: "Read setup. This does not create, change or delete a record. Amounts are integer milliunits: 1000 is one unit of the book currency. Money that enters the account is positive.",
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
  operationId: "post_setup",
  description: "Create or run setup. This does not change records outside this action. Amounts are integer milliunits: 1000 is one unit of the book currency. Money that enters the account is positive.",
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
  operationId: "get_settings_currency",
  description: "Read the book currency. This does not create, change or delete a record. Amounts are integer milliunits: 1000 is one unit of the book currency. Money that enters the account is positive.",
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
  operationId: "patch_settings_currency",
  description: "Change the book currency. This is only a new label: amounts are not converted and do not change. Amounts are integer milliunits: 1000 is one unit of the book currency. Money that enters the account is positive.",
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
  operationId: "get_settings_matching",
  description:
    "Read when labels become automatic. This does not create, change or delete a record. Amounts are integer milliunits: 1000 is one unit of the book currency. Money that enters the account is positive.",
  responses: {
    200: {
      description: "When labels become automatic",
      content: { "application/json": { schema: matchingSettingSchema } },
    },
    409: errorResponse,
  },
});

const aiReadRoute = createRoute({
  method: "get",
  path: "/api/settings/ai",
  operationId: "get_ai_access",
  description:
    "Read whether an AI may change the books. This does not create, change or delete a record. Amounts are integer milliunits: 1000 is one unit of the book currency. Money that enters the account is positive.",
  responses: {
    200: {
      description: "Whether an AI may change the books",
      content: { "application/json": { schema: aiAccessSettingSchema } },
    },
  },
});

const aiRoute = createRoute({
  method: "patch",
  path: "/api/settings/ai",
  operationId: "patch_ai_access",
  description:
    "Allow or block AI changes to the books. This changes only that setting. Amounts are integer milliunits: 1000 is one unit of the book currency. Money that enters the account is positive.",
  request: {
    body: { required: true, content: { "application/json": { schema: aiAccessSettingSchema } } },
  },
  responses: {
    200: {
      description: "Whether an AI may change the books",
      content: { "application/json": { schema: aiAccessSettingSchema } },
    },
    400: errorResponse,
    409: errorResponse,
  },
});

const matchingRoute = createRoute({
  operationId: "patch_settings_matching",
  description: "Change when labels become automatic. This does not change transactions or categories. Amounts are integer milliunits: 1000 is one unit of the book currency. Money that enters the account is positive.",
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

export function setupRoutes(db: Db) {
  return new OpenAPIHono({ defaultHook: validationHook })
    .openapi(setupStatusRoute, (c) => c.json(setupStatus(db), 200))
    .openapi(setupRoute, (c) => {
      const body = c.req.valid("json");
      return c.json(runSetup(db, { ...body, source: "ui" }), 200);
    })
    .openapi(currencyReadRoute, (c) => c.json(bookCurrency(db), 200))
    .openapi(currencyRoute, (c) => {
      const body = c.req.valid("json");
      return c.json(changeCurrency(db, { currency: body.currency, source: "ui" }), 200);
    })
    .openapi(matchingReadRoute, (c) => c.json(matchingSetting(db), 200))
    .openapi(matchingRoute, (c) => {
      const body = c.req.valid("json");
      return c.json(changeMatching(db, { autoConfidence: body.autoConfidence, source: "ui" }), 200);
    })
    .openapi(aiReadRoute, (c) => c.json({ aiCanWrite: aiCanWrite(db) }, 200))
    .openapi(aiRoute, (c) => {
      const body = c.req.valid("json");
      return c.json(changeAiAccess(db, { aiCanWrite: body.aiCanWrite, source: "ui" }), 200);
    });
}

export type SetupRoutes = ReturnType<typeof setupRoutes>;
