import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { auditLog, forecastSnapshots, migrateDatabase, openDatabase } from "@num/db";
import {
  accountListQuerySchema,
  categoryListQuerySchema,
  columnMapSchema,
  importViewQuerySchema,
  inboxQuerySchema,
  merchantListQuerySchema,
  planListQuerySchema,
  transactionListQuerySchema,
  type ColumnMap,
} from "@num/shared";
import { expect, test } from "bun:test";
import { createApp } from "../app";
import { createDb, type Db } from "../db";
import { createAccount } from "../services/accounts";
import { listBuckets } from "../services/buckets";
import { listCategories, listCategoryGroups } from "../services/categories";
import { readForecastOnly } from "../services/forecast";
import { fundingPosition } from "../services/funding-book";
import { listImportView } from "../services/import-list";
import { importStatement } from "../services/imports";
import { listInbox } from "../services/inbox";
import { createMerchant, listMerchants } from "../services/merchants";
import { listPlans, createPlan } from "../services/recurring-plans";
import { listOccurrences } from "../services/recurring-view";
import { listAccounts } from "../services/accounts";
import { createBucket } from "../services/buckets";
import { runSetup } from "../services/setup";
import { listTransactions } from "../services/transaction-list";
import { createTransaction } from "../services/transactions";
import { bucketReadSchema } from "./read-tools";

const asOf = "2026-10-08";
const at = "2026-10-08T16:00:00Z";
const saved = { source: "ui" as const, at };

const map: ColumnMap = columnMapSchema.parse({
  hasHeader: true,
  date: 0,
  description: 1,
  amount: 2,
  dateOrder: "mdy",
  signConvention: "account",
});

type Rpc = {
  result?: {
    isError?: boolean;
    structuredContent?: Record<string, unknown>;
    content?: { type: string; text: string }[];
  };
  error?: { code: number; message: string };
};

function tempBook() {
  const dir = mkdtempSync(join(tmpdir(), "num-mcp-"));
  const sqlite = openDatabase(join(dir, "num.sqlite"));
  migrateDatabase(sqlite);
  const db = createDb(sqlite);
  runSetup(db, { currency: "CAD", categorySet: "default", ...saved });
  return {
    dir,
    db,
    close() {
      sqlite.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

async function post(db: Db, dataDir: string, method: string, params: object) {
  const app = createApp(db, { dataDir });
  const response = await app.request("/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const text = await response.text();
  const contentType = response.headers.get("content-type");
  const payload = contentType?.includes("text/event-stream")
    ? text
        .split("\n")
        .filter((line) => line.startsWith("data: "))
        .map((line) => line.slice("data: ".length))
        .at(-1)
    : text;
  const body = JSON.parse(payload ?? "") as Rpc;
  return { status: response.status, body };
}

async function callTool(db: Db, dataDir: string, name: string, args: Record<string, unknown>) {
  const { status, body } = await post(db, dataDir, "tools/call", { name, arguments: args });
  expect(status).toBe(200);
  return body;
}

function dataOf(body: Rpc): Record<string, unknown> {
  expect(body.error).toBeUndefined();
  expect(body.result?.isError).toBeFalsy();
  const data = body.result?.structuredContent;
  if (data === undefined) {
    throw new Error("Missing tool data");
  }
  expect(body.result?.content).toEqual([{ type: "text", text: JSON.stringify(data) }]);
  return data;
}

function seed(db: Db, dir: string) {
  const account = createAccount(db, {
    name: "Everyday",
    kind: "chequing",
    openingDate: "2026-01-01",
    openingBalance: 10_000,
    ...saved,
  });
  const category = listCategories(db, categoryListQuerySchema.parse({})).items[0];
  if (!category) {
    throw new Error("Setup did not create a category");
  }
  const merchant = createMerchant(db, { name: "North Market", defaultCategoryId: category.id, ...saved });
  createTransaction(db, {
    accountId: account.id,
    date: "2026-03-02",
    amount: -400,
    payeeRaw: "North Market",
    merchantId: merchant.id,
    status: "cleared",
    lines: [{ amount: -400, categoryId: category.id }],
    ...saved,
  });
  createBucket(db, {
    name: "Food",
    kind: "spending",
    priority: 1,
    essential: false,
    color: "mint",
    icon: "shopping-cart",
    categoryIds: [category.id],
    refillTo: 5_000,
    amount: null,
    dueDate: null,
    repeat: null,
    target: null,
    targetDate: null,
    fixedAmount: null,
    ...saved,
  });
  const plan = createPlan(db, {
    name: "Rent",
    kind: "bill",
    accountId: account.id,
    expectedAmount: -90_000,
    tolerance: 0,
    amountMode: "fixed",
    categoryId: category.id,
    startDate: "2026-01-15",
    freq: "monthly",
    interval: 1,
    monthDay: 15,
    businessDayShift: "none",
    active: true,
    fundsBuckets: false,
    ...saved,
  });
  const imported = importStatement(db, dir, {
    source: "import",
    at,
    asOf,
    accountId: account.id,
    filename: "march.csv",
    mimeType: "text/csv",
    bytes: new TextEncoder().encode("date,description,amount\n03/04/2026,CITY TRANSIT,-2.00\n"),
    columnMap: map,
  });
  if (imported.kind !== "batch") {
    throw new Error("Expected an import batch");
  }
  return { accountId: account.id, planId: plan.id };
}

test("each read tool returns the same data as its service", async () => {
  const book = tempBook();
  try {
    const { accountId, planId } = seed(book.db, book.dir);
    const accountsQuery = accountListQuerySchema.parse({ sort: "name", dir: "asc" });
    const transactionQuery = transactionListQuerySchema.parse({
      q: "north",
      accountId,
      from: "2026-03-01",
      to: "2026-03-31",
      page: 1,
      pageSize: 10,
    });
    const categoryQuery = categoryListQuerySchema.parse({});
    const merchantQuery = merchantListQuerySchema.parse({});
    const bucketQuery = bucketReadSchema.parse({ asOf, sort: "name" });
    const planQuery = planListQuerySchema.parse({ accountId, kind: "bill" });
    const inboxQuery = inboxQuerySchema.parse({ asOf, dismissed: false });
    const importQuery = importViewQuerySchema.parse({ accountId, from: "2026-01-01" });

    expect(dataOf(await callTool(book.db, book.dir, "list_accounts", { sort: "name", dir: "asc" }))).toEqual(
      listAccounts(book.db, accountsQuery),
    );
    expect(dataOf(await callTool(book.db, book.dir, "search_transactions", transactionQuery))).toEqual(
      listTransactions(book.db, transactionQuery),
    );
    expect(dataOf(await callTool(book.db, book.dir, "list_categories", {}))).toEqual(listCategories(book.db, categoryQuery));
    expect(dataOf(await callTool(book.db, book.dir, "list_category_groups", {}))).toEqual(listCategoryGroups(book.db));
    expect(dataOf(await callTool(book.db, book.dir, "list_merchants", {}))).toEqual(listMerchants(book.db, merchantQuery));
    const { asOf: bucketAsOf, ...bucketsOnly } = bucketQuery;
    expect(dataOf(await callTool(book.db, book.dir, "list_buckets", { asOf, sort: "name" }))).toEqual({
      buckets: listBuckets(book.db, bucketsOnly),
      position: fundingPosition(book.db, bucketAsOf),
    });
    expect(dataOf(await callTool(book.db, book.dir, "list_plans", { accountId, kind: "bill" }))).toEqual(
      listPlans(book.db, planQuery),
    );
    expect(dataOf(await callTool(book.db, book.dir, "list_occurrences", { id: planId, asOf }))).toEqual(
      listOccurrences(book.db, planId, asOf),
    );
    expect(dataOf(await callTool(book.db, book.dir, "get_forecast", { asOf }))).toEqual(readForecastOnly(book.db, asOf));
    expect(dataOf(await callTool(book.db, book.dir, "list_inbox", { asOf, dismissed: false }))).toEqual(
      listInbox(book.db, inboxQuery.asOf, inboxQuery.dismissed),
    );
    expect(dataOf(await callTool(book.db, book.dir, "list_imports", { accountId, from: "2026-01-01" }))).toEqual(
      listImportView(book.db, importQuery),
    );
  } finally {
    book.close();
  }
});

test("tools that need today require asOf", async () => {
  const book = tempBook();
  try {
    const listed = await post(book.db, book.dir, "tools/list", {});
    const tools =
      (
        listed.body as Rpc & {
          result?: { tools?: { name: string; inputSchema?: { required?: string[]; properties?: Record<string, { format?: string; pattern?: string }> } }[] };
        }
      ).result?.tools ?? [];
    for (const name of ["list_buckets", "list_occurrences", "get_forecast", "list_inbox"]) {
      const schema = tools.find((tool) => tool.name === name)?.inputSchema;
      expect(schema?.required).toContain("asOf");
      expect(schema?.properties?.asOf).toMatchObject({ format: "date", pattern: String.raw`^\d{4}-\d{2}-\d{2}$` });
    }
    expect(tools.find((tool) => tool.name === "list_accounts")?.inputSchema?.required ?? []).not.toContain("asOf");
  } finally {
    book.close();
  }
});

test("read tools do not write", async () => {
  const book = tempBook();
  try {
    const { accountId, planId } = seed(book.db, book.dir);
    const before = {
      audit: book.db.select().from(auditLog).all().length,
      snapshots: book.db.select().from(forecastSnapshots).all().length,
    };
    const calls: [string, Record<string, unknown>][] = [
      ["list_accounts", {}],
      ["search_transactions", { accountId }],
      ["list_categories", {}],
      ["list_category_groups", {}],
      ["list_merchants", {}],
      ["list_buckets", { asOf }],
      ["list_plans", {}],
      ["list_occurrences", { id: planId, asOf }],
      ["get_forecast", { asOf }],
      ["list_inbox", { asOf }],
      ["list_imports", {}],
    ];
    for (const [name, args] of calls) {
      const body = await callTool(book.db, book.dir, name, args);
      expect(body.result?.isError).toBeFalsy();
    }
    expect(book.db.select().from(auditLog).all().length).toBe(before.audit);
    expect(book.db.select().from(forecastSnapshots).all().length).toBe(before.snapshots);
  } finally {
    book.close();
  }
});

test("date tools reject a call without asOf", async () => {
  const book = tempBook();
  try {
    const { planId } = seed(book.db, book.dir);
    const names = ["list_buckets", "list_occurrences", "get_forecast", "list_inbox"] as const;
    for (const name of names) {
      const missing = await callTool(book.db, book.dir, name, name === "list_occurrences" ? { id: planId } : {});
      expect(missing.result?.isError).toBe(true);
      expect(missing.result?.structuredContent).toEqual({ code: "as_of_required", params: {} });
    }

    const accounts = await callTool(book.db, book.dir, "list_accounts", {});
    expect(accounts.error).toBeUndefined();
    expect(dataOf(accounts).items).toEqual(listAccounts(book.db, accountListQuerySchema.parse({})).items);
  } finally {
    book.close();
  }
});

test("an unknown tool or bad input returns an error code", async () => {
  const book = tempBook();
  try {
    const unknown = await callTool(book.db, book.dir, "propose_transactions", {});
    expect(unknown.error?.code).toEqual(expect.any(Number));
    expect(unknown.result).toBeUndefined();

    const badDate = await callTool(book.db, book.dir, "get_forecast", { asOf: "2026-02-31" });
    expect(badDate.result?.isError).toBe(true);
    expect(badDate.result?.structuredContent).toEqual({ code: "as_of_invalid", params: { asOf: "2026-02-31" } });

    const badPage = await callTool(book.db, book.dir, "search_transactions", { page: 0 });
    expect(badPage.result?.isError).toBe(true);
    expect(badPage.result?.structuredContent).toEqual({ code: "invalid_query", params: { field: "page" } });

    const missingPlan = await callTool(book.db, book.dir, "list_occurrences", {
      id: "00000000-0000-4000-8000-000000000001",
      asOf,
    });
    expect(missingPlan.result?.isError).toBe(true);
    expect(missingPlan.result?.structuredContent).toEqual({ code: "plan_not_found", params: {} });
  } finally {
    book.close();
  }
});
