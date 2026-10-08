import {
  asOfQuerySchema,
  errorSchema,
  fundingPaycheckListSchema,
  fundingPositionSchema,
  fundingProposalQuerySchema,
  fundingProposalSchema,
  fundingRunCreateSchema,
  fundingRunListSchema,
  fundingRunSchema,
} from "@num/shared";
import { createRoute, z, type OpenAPIHono } from "@hono/zod-openapi";
import type { Db } from "../db";
import { fundingPosition, fundingProposalFor, listFundingPaychecks } from "../services/funding-book";
import { createFundingRun, listFundingRuns, undoFundingRun } from "../services/funding-runs";

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

const positionRoute = createRoute({
  method: "get",
  path: "/api/funding/position",
  request: { query: asOfQuerySchema },
  responses: {
    200: {
      description: "On-budget total, bills reserved and Unassigned",
      content: { "application/json": { schema: fundingPositionSchema } },
    },
    400: errorResponse,
  },
});

const paychecksRoute = createRoute({
  method: "get",
  path: "/api/funding/paychecks",
  responses: {
    200: {
      description: "Income deposits that can fund buckets",
      content: { "application/json": { schema: fundingPaycheckListSchema } },
    },
  },
});

const proposalRoute = createRoute({
  method: "get",
  path: "/api/funding/proposal",
  request: { query: fundingProposalQuerySchema },
  responses: {
    200: {
      description: "A paycheck funding proposal",
      content: { "application/json": { schema: fundingProposalSchema } },
    },
    400: errorResponse,
    404: errorResponse,
    409: errorResponse,
  },
});

const listRoute = createRoute({
  method: "get",
  path: "/api/funding/runs",
  responses: {
    200: {
      description: "Funding runs",
      content: { "application/json": { schema: fundingRunListSchema } },
    },
  },
});

const createRouteDef = createRoute({
  method: "post",
  path: "/api/funding/runs",
  request: {
    query: asOfQuerySchema,
    body: { required: true, content: { "application/json": { schema: fundingRunCreateSchema } } },
  },
  responses: {
    200: {
      description: "The funding run",
      content: { "application/json": { schema: fundingRunSchema } },
    },
    400: errorResponse,
    404: errorResponse,
    409: errorResponse,
  },
});

const undoRoute = createRoute({
  method: "post",
  path: "/api/funding/runs/{id}/undo",
  request: { params: idParams },
  responses: {
    200: {
      description: "The undone funding run",
      content: { "application/json": { schema: fundingRunSchema } },
    },
    404: errorResponse,
    409: errorResponse,
  },
});

export function registerFunding(app: OpenAPIHono, db: Db) {
  app.openapi(positionRoute, (c) => c.json(fundingPosition(db, c.req.valid("query").asOf), 200));
  app.openapi(paychecksRoute, (c) => c.json(listFundingPaychecks(db), 200));
  app.openapi(proposalRoute, (c) => {
    const query = c.req.valid("query");
    return c.json(fundingProposalFor(db, query.incomeTransactionId, query.asOf), 200);
  });
  app.openapi(listRoute, (c) => c.json(listFundingRuns(db), 200));
  app.openapi(createRouteDef, (c) =>
    c.json(createFundingRun(db, { ...c.req.valid("json"), asOf: c.req.valid("query").asOf, source: "ui" }), 200),
  );
  app.openapi(undoRoute, (c) => c.json(undoFundingRun(db, c.req.valid("param").id, { source: "ui" }), 200));
}
