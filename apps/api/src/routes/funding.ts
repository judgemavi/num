import { asOfQuerySchema, availableSchema, fillResultSchema, fundingPositionSchema, owedSchema } from "@num/shared";
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import type { Db } from "../db";
import { readAvailable } from "../services/available";
import { fundingPosition } from "../services/funding-book";
import { fillBuckets } from "../services/funding-fill";
import { readOwed } from "../services/funding-months";
import { validationHook } from "../validation";
import { errorResponse } from "./common";

const units = "Amounts are integer milliunits: 1000 is one unit of the book currency. Money that enters the account is positive.";
const readOnly = `Read funding. This does not create, change or delete a record. ${units}`;

const positionRoute = createRoute({
  operationId: "get_funding_position",
  description: readOnly,
  method: "get",
  path: "/api/funding/position",
  request: { query: asOfQuerySchema },
  responses: {
    200: {
      description: "On-budget total and Unassigned",
      content: { "application/json": { schema: fundingPositionSchema } },
    },
    400: errorResponse,
  },
});

const owedRoute = createRoute({
  operationId: "get_funding_owed",
  description: `${readOnly} For the month of asOf: the monthly amount of each bucket and the amount that is still owed.`,
  method: "get",
  path: "/api/funding/owed",
  request: { query: asOfQuerySchema },
  responses: {
    200: { description: "The monthly amounts and the amounts still owed", content: { "application/json": { schema: owedSchema } } },
    400: errorResponse,
  },
});

const availableRoute = createRoute({
  operationId: "get_funding_available",
  description: `${readOnly} Available to spend: the on-budget total, minus the positive balances of the savings buckets (sinking, goal, emergency), minus the bills set aside. Bills set aside: for each commitment bucket, its positive balance plus the amount that it is short for its occurrences in the next 30 days after asOf.`,
  method: "get",
  path: "/api/funding/available",
  request: { query: asOfQuerySchema },
  responses: {
    200: {
      description: "Available to spend and its parts",
      content: { "application/json": { schema: availableSchema } },
    },
    400: errorResponse,
  },
});

const fillRoute = createRoute({
  operationId: "post_funding_fill",
  description: `Create or run funding. Cover the buckets below zero, then pay the amounts that buckets still owe from Unassigned for the month of asOf, in priority order. When Unassigned cannot cover a bucket below zero, the savings buckets that can give money back give it to Unassigned, the lowest priority first. A paused bucket is not funded. It writes nothing when nothing is owed. This does not change records outside this action. ${units}`,
  method: "post",
  path: "/api/funding/fill",
  request: { query: asOfQuerySchema },
  responses: {
    200: { description: "The total that was paid", content: { "application/json": { schema: fillResultSchema } } },
    400: errorResponse,
    409: errorResponse,
  },
});

export function fundingRoutes(db: Db) {
  return new OpenAPIHono({ defaultHook: validationHook })
    .openapi(positionRoute, (c) => c.json(fundingPosition(db, c.req.valid("query").asOf), 200))
    .openapi(owedRoute, (c) => c.json(readOwed(db, c.req.valid("query").asOf), 200))
    .openapi(availableRoute, (c) => c.json(readAvailable(db, c.req.valid("query").asOf), 200))
    .openapi(fillRoute, (c) => c.json(fillBuckets(db, { asOf: c.req.valid("query").asOf, source: "ui" }), 200));
}

export type FundingRoutes = ReturnType<typeof fundingRoutes>;
