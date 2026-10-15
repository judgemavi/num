import { asOfQuerySchema, hygieneSchema, needsYouSchema } from "@num/shared";
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import type { Db } from "../db";
import { readHygiene } from "../services/hygiene";
import { readNeedsYou } from "../services/needs-you";
import { validationHook } from "../validation";
import { errorResponse } from "./common";

const hygieneRoute = createRoute({
  operationId: "get_hygiene",
  description: "Read hygiene checks. This does not create, change or delete a record. Amounts are integer milliunits: 1000 is one unit of the book currency. Money that enters the account is positive.",
  method: "get",
  path: "/api/hygiene",
  request: { query: asOfQuerySchema },
  responses: {
    200: {
      description: "Hygiene checks for asOf",
      content: { "application/json": { schema: hygieneSchema } },
    },
    400: errorResponse,
  },
});

const needsYouRoute = createRoute({
  operationId: "get_needs_you",
  description: "Read the items that need the user (Home \"Needs you\"): transactions that need review, accounts that do not match their bank, old imports, missed payments, overspent buckets, goals that do not fit the monthly income, the emergency fund, a savings rate below 0% and categories that went up against their median. Only the checks that fail are in the list. This does not create, change or delete a record. Amounts are integer milliunits: 1000 is one unit of the book currency. Money that enters the account is positive.",
  method: "get",
  path: "/api/needs-you",
  request: { query: asOfQuerySchema },
  responses: {
    200: {
      description: "The items that need the user on asOf",
      content: { "application/json": { schema: needsYouSchema } },
    },
    400: errorResponse,
  },
});

export function hygieneRoutes(db: Db) {
  return new OpenAPIHono({ defaultHook: validationHook })
    .openapi(hygieneRoute, (c) => c.json(readHygiene(db, c.req.valid("query").asOf), 200))
    .openapi(needsYouRoute, (c) => c.json(readNeedsYou(db, c.req.valid("query").asOf), 200));
}

export type HygieneRoutes = ReturnType<typeof hygieneRoutes>;
