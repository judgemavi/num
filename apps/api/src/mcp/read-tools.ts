import type { McpServer } from "@modelcontextprotocol/server";
import {
  accountListQuerySchema,
  asOfQuerySchema,
  bucketListQuerySchema,
  categoryListQuerySchema,
  importViewQuerySchema,
  inboxQuerySchema,
  insightsQuerySchema,
  isoDateSchema,
  merchantListQuerySchema,
  planListQuerySchema,
  transactionListQuerySchema,
} from "@num/shared";
import { z } from "zod";
import type { Db } from "../db";
import { listAccounts } from "../services/accounts";
import { listBuckets } from "../services/buckets";
import { listCategories, listCategoryGroups } from "../services/categories";
import { readForecastOnly } from "../services/forecast";
import { fundingPosition } from "../services/funding-book";
import { listImportView } from "../services/import-list";
import { listInbox } from "../services/inbox";
import { readInsights } from "../services/insights";
import { listMerchants } from "../services/merchants";
import { listPlans } from "../services/recurring-plans";
import { listOccurrences } from "../services/recurring-view";
import { listTransactions } from "../services/transaction-list";
import { publishedSchema, readTool } from "./result";

const readOnly = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

export const bucketReadSchema = bucketListQuerySchema.extend({
  asOf: isoDateSchema,
});

export const occurrenceReadSchema = z.object({
  id: z.uuid(),
  asOf: isoDateSchema,
});

type ToolConfig = {
  description: string;
  inputSchema: z.ZodType;
};

function addTool(server: McpServer, name: string, config: ToolConfig, load: (args: Record<string, unknown>) => object) {
  server.registerTool(
    name,
    {
      description: config.description,
      inputSchema: publishedSchema(config.inputSchema),
      annotations: readOnly,
    },
    (args) => readTool(args, () => load(args as Record<string, unknown>)),
  );
}

export function registerReadTools(server: McpServer, db: Db) {
  addTool(
    server,
    "list_accounts",
    {
      description: "List accounts and balances. Amounts are integer minor units.",
      inputSchema: accountListQuerySchema,
    },
    (args) => listAccounts(db, accountListQuerySchema.parse(args)),
  );

  addTool(
    server,
    "search_transactions",
    {
      description: "Search transactions. Filters match the transaction list.",
      inputSchema: transactionListQuerySchema,
    },
    (args) => listTransactions(db, transactionListQuerySchema.parse(args)),
  );

  addTool(
    server,
    "list_categories",
    {
      description: "List categories.",
      inputSchema: categoryListQuerySchema,
    },
    (args) => listCategories(db, categoryListQuerySchema.parse(args)),
  );

  addTool(
    server,
    "list_category_groups",
    {
      description: "List category groups.",
      inputSchema: z.object({}),
    },
    () => listCategoryGroups(db),
  );

  addTool(
    server,
    "list_merchants",
    {
      description: "List merchants.",
      inputSchema: merchantListQuerySchema,
    },
    (args) => listMerchants(db, merchantListQuerySchema.parse(args)),
  );

  addTool(
    server,
    "list_buckets",
    {
      description: "List buckets with balances, and the funding position including Unassigned. Requires asOf.",
      inputSchema: bucketReadSchema,
    },
    (args) => {
      const { asOf, ...query } = bucketReadSchema.parse(args);
      return {
        buckets: listBuckets(db, query),
        position: fundingPosition(db, asOf),
      };
    },
  );

  addTool(
    server,
    "list_plans",
    {
      description: "List recurring plans.",
      inputSchema: planListQuerySchema,
    },
    (args) => listPlans(db, planListQuerySchema.parse(args)),
  );

  addTool(
    server,
    "list_occurrences",
    {
      description: "List occurrences for one recurring plan. Requires asOf.",
      inputSchema: occurrenceReadSchema,
    },
    (args) => {
      const { id, asOf } = occurrenceReadSchema.parse(args);
      return listOccurrences(db, id, asOf);
    },
  );

  addTool(
    server,
    "get_insights",
    {
      description: "Read spending for a period, the 12-month trend and 24 months of net worth. Requires asOf. Amounts are integer minor units.",
      inputSchema: insightsQuerySchema,
    },
    (args) => readInsights(db, insightsQuerySchema.parse(args)),
  );

  addTool(
    server,
    "get_forecast",
    {
      description: "Read the 90-day forecast, including safe to spend. Requires asOf.",
      inputSchema: asOfQuerySchema,
    },
    (args) => readForecastOnly(db, asOfQuerySchema.parse(args).asOf),
  );

  addTool(
    server,
    "list_inbox",
    {
      description: "List Inbox items. Requires asOf.",
      inputSchema: inboxQuerySchema,
    },
    (args) => {
      const query = inboxQuerySchema.parse(args);
      return listInbox(db, query.asOf);
    },
  );

  addTool(
    server,
    "list_imports",
    {
      description: "List import batches.",
      inputSchema: importViewQuerySchema,
    },
    (args) => listImportView(db, importViewQuerySchema.parse(args)),
  );
}
