import {
  asOfQuerySchema,
  fillResultSchema,
  fundingPositionSchema,
  monthFundingListSchema,
  monthFundingSchema,
  monthParamSchema,
  owedSchema,
} from "@num/shared";
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import type { Db } from "../db";
import { fundingPosition } from "../services/funding-book";
import { fillBuckets, fundMonthAgain } from "../services/funding-fill";
import { listMonthFunding, readOwed, undoMonthFunding } from "../services/funding-months";
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
      description: "On-budget total, Unassigned and the next payday",
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

const monthsRoute = createRoute({
  operationId: "get_funding_months",
  description: readOnly,
  method: "get",
  path: "/api/funding/months",
  responses: {
    200: { description: "The funding of each month", content: { "application/json": { schema: monthFundingListSchema } } },
  },
});

const fillRoute = createRoute({
  operationId: "post_funding_fill",
  description: `Create or run funding. Pay the amounts that buckets still owe from Unassigned, month by month up to the month of asOf, in priority order. It writes nothing when nothing is owed. This does not change records outside this action. ${units}`,
  method: "post",
  path: "/api/funding/fill",
  request: { query: asOfQuerySchema },
  responses: {
    200: { description: "The total that was paid", content: { "application/json": { schema: fillResultSchema } } },
    400: errorResponse,
    409: errorResponse,
  },
});

const undoRoute = createRoute({
  operationId: "post_funding_months_month_undo",
  description: `Undo funding (undo) of one month. The money goes back to Unassigned, and the month is held: the fill does not pay it again. This reverses that change. It does not remove the audit log. ${units}`,
  method: "post",
  path: "/api/funding/months/{month}/undo",
  request: { params: monthParamSchema },
  responses: {
    200: { description: "The held month", content: { "application/json": { schema: monthFundingSchema } } },
    404: errorResponse,
    409: errorResponse,
  },
});

const againRoute = createRoute({
  operationId: "post_funding_months_month_again",
  description: `Create or run funding. Remove the hold of a month whose funding was undone, then fill. This does not change records outside this action. ${units}`,
  method: "post",
  path: "/api/funding/months/{month}/again",
  request: { params: monthParamSchema, query: asOfQuerySchema },
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
    .openapi(monthsRoute, (c) => c.json(listMonthFunding(db), 200))
    .openapi(fillRoute, (c) => c.json(fillBuckets(db, { asOf: c.req.valid("query").asOf, source: "ui" }), 200))
    .openapi(undoRoute, (c) => c.json(undoMonthFunding(db, c.req.valid("param").month, { source: "ui" }), 200))
    .openapi(againRoute, (c) =>
      c.json(fundMonthAgain(db, c.req.valid("param").month, { asOf: c.req.valid("query").asOf, source: "ui" }), 200),
    );
}

export type FundingRoutes = ReturnType<typeof fundingRoutes>;
