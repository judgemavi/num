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
  description: "Read the items that need the user (Home \"Needs you\"): in this order: review (transactions that need review, and the count older than 7 days), bank_mismatch (an account that does not match its bank), imports_stale (imports older than staleImportDays), missed (a missed payment of a bill or an income), overspent (buckets below zero), goals_short (goals that do not fit the monthly income), bills_short (a bill whose next payment, due in the next 30 days, has a part that its balance and Unassigned do not hold: the short part), emergency_fund (the emergency fund below its target), savings_used (savings buckets that gave money back this month, with each savings and covered bucket), pool_short (the forecast pool runs short: the date, the short amount, the buckets to pause, the buckets that would give money back and the part not covered), savings_rate (complete months with a savings rate below 0%) and spending_up (a category that went up against its median this month). Only the checks that fail are in the list. This does not create, change or delete a record. Amounts are integer milliunits: 1000 is one unit of the book currency. Money that enters the account is positive.",
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
