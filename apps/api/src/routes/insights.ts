import { insightsQuerySchema, insightsSchema } from "@num/shared";
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import type { Db } from "../db";
import { readInsights } from "../services/insights";
import { validationHook } from "../validation";
import { errorResponse } from "./common";

const insightsRoute = createRoute({
  operationId: "get_insights",
  description: "Read the spending report of a period (Home \"Spending\"): the income, the spending, the savings and the savings rate; the colour and spending of each group and its categories, with the three largest increases (delta and median) on category rows only for This month with no tag; and the timeline: the income and spending of each month and, for a period that ends on asOf, the months of the 90-day forecast (get_forecast has the daily balances). With a category, the timeline shows only the spending of that category. With a tagId, the spending totals use only the spending lines that have that tag (a line with more than one tag counts in full for each tag); income, savings and the savings rate are null, and the timeline shows only spending, with no forecast. The period: window is the number of months that end with the month of asOf (default 1), or all (from the first transaction), or custom with from and to. A window can start before the first transaction; those months are zero, thus compare from with the first month of data or use all. month (YYYY-MM) limits the totals, the groups, the categories and debtPayments to one month in the period: range shows that month, from and to keep the period, and the timeline keeps all months. A month outside the period is period_invalid. Spending is the expense lines with a category (refunds decrease it; interest is in its expense category) plus the principal that on-budget accounts pay to mortgages and loans (debtPayments, by debt account). Income is the income lines with a category. Uncategorized lines are not in income or spending: when there are such lines, the last group (kind uncategorized, id null, no categories) has their money out as amount and their money in as inflow. inflow is null on the other rows. The group with kind none has the categories with no group. savingsRateMilliPct is (income − spending) / income in thousandths of a percent (21499 is 21.499%), null when there is no income. In the timeline, the month of asOf has actual (to asOf) and forecast (the rest of the month). Groups, categories and debt payments have only ids: get the names from list_category_groups, list_categories and list_accounts. Income is one total with no categories: search_transactions with an income category gives its parts. Use get_tags for the tags of trips and projects. This does not create, change or delete a record.",
  method: "get",
  path: "/api/insights",
  request: { query: insightsQuerySchema },
  responses: {
    200: {
      description: "The totals, the savings rate, the groups and categories, and the timeline of the period",
      content: { "application/json": { schema: insightsSchema } },
    },
    400: errorResponse,
    404: errorResponse,
  },
});

export function insightsRoutes(db: Db) {
  return new OpenAPIHono({ defaultHook: validationHook })
    .openapi(insightsRoute, (c) => c.json(readInsights(db, c.req.valid("query")), 200));
}
