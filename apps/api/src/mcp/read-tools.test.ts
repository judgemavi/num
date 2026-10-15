import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrateDatabase, openDatabase } from "@num/db";
import { columnMapSchema, type ColumnMap } from "@num/shared";
import { expect, test } from "bun:test";
import type { OpenAPIHono } from "@hono/zod-openapi";
import { createApp } from "../app";
import { createDb, type Db } from "../db";
import { createAccount } from "../services/accounts";
import { createBucket } from "../services/buckets";
import { listCategories } from "../services/categories";
import { importStatement } from "../services/imports";
import { createMerchant } from "../services/merchants";
import { createSchedule } from "../services/schedule-test-book";
import { runSetup } from "../services/setup";
import { createTransaction } from "../services/transactions";

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
    tools?: { name: string; inputSchema?: { required?: string[]; properties?: Record<string, { format?: string; pattern?: string }> } }[];
  };
  error?: { code: number; message: string };
};

function tempBook() {
  const dir = mkdtempSync(join(tmpdir(), "num-mcp-"));
  const sqlite = openDatabase(join(dir, "num.sqlite"));
  migrateDatabase(sqlite);
  const db = createDb(sqlite);
  runSetup(db, { asOf: "2026-10-07", currency: "CAD", categorySet: "default", ...saved });
  const app = createApp(db, { dataDir: dir });
  return {
    dir,
    db,
    app,
    close() {
      sqlite.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

async function post(app: OpenAPIHono, method: string, params: object) {
  const response = await app.request("/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      host: "localhost",
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
  return { status: response.status, body: JSON.parse(payload ?? "") as Rpc };
}

async function callTool(app: OpenAPIHono, name: string, args: Record<string, unknown>) {
  const { status, body } = await post(app, "tools/call", { name, arguments: args });
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

async function restJson(app: OpenAPIHono, path: string): Promise<Record<string, unknown>> {
  const response = await app.request(path);
  expect(response.status).toBe(200);
  return response.json() as Promise<Record<string, unknown>>;
}

function seed(db: Db, dir: string) {
  const account = createAccount(db, {
    name: "Everyday",
    kind: "chequing",
    openingDate: "2026-01-01",
    openingBalance: 100_000,
    ...saved,
  });
  const category = listCategories(db, { page: 1, pageSize: 50, archived: false }).items[0];
  if (!category) {
    throw new Error("Setup did not create a category");
  }
  const merchant = createMerchant(db, { name: "North Market", ...saved });
  createTransaction(db, {
    accountId: account.id,
    date: "2026-03-02",
    amount: -4_000,
    payeeRaw: "North Market",
    merchantId: merchant.id,
    lines: [{ amount: -4_000, categoryId: category.id }],
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
    refillTo: 50_000,
    amount: null,
    dueDate: null,
    repeat: null,
    target: null,
    targetDate: null,
    fixedAmount: null,
    months: null,
    fillMonths: null,
    schedule: null,
    asOf: "2000-01-01",
    ...saved,
  });
  const plan = createSchedule(db, {
    name: "Rent",
    kind: "commitment",
    accountId: account.id,
    expectedAmount: -900_000,
    tolerance: 0,
    amountMode: "fixed",
    categoryId: category.id,
    startDate: "2026-01-15",
    freq: "monthly",
    interval: 1,
    monthDay: 15,
    businessDayShift: "none",
    payday: false,
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
  return { accountId: account.id, bucketId: plan.id };
}

test("a read tool returns the same data as REST", async () => {
  const book = tempBook();
  try {
    const { accountId, bucketId } = seed(book.db, book.dir);
    const cases: [string, Record<string, unknown>, string][] = [
      ["list_accounts", { sort: "name", dir: "asc" }, "/api/accounts?sort=name&dir=asc"],
      [
        "search_transactions",
        { q: "north", accountId, from: "2026-03-01", to: "2026-03-31", page: 1, pageSize: 10 },
        `/api/transactions?q=north&accountId=${accountId}&from=2026-03-01&to=2026-03-31&page=1&pageSize=10`,
      ],
      ["list_categories", {}, "/api/categories"],
      ["list_category_groups", {}, "/api/category-groups"],
      ["list_merchants", {}, "/api/merchants"],
      ["list_buckets", { sort: "name" }, "/api/buckets?sort=name"],
      ["list_occurrences", { id: bucketId, asOf }, `/api/buckets/${bucketId}/occurrences?asOf=${asOf}`],
      ["get_forecast", { asOf }, `/api/forecast?asOf=${asOf}`],
      ["get_insights", { asOf, window: "3" }, `/api/insights?asOf=${asOf}&window=3`],
      ["get_hygiene", { asOf }, `/api/hygiene?asOf=${asOf}`],
      ["list_imports", { accountId, from: "2026-01-01" }, `/api/imports?accountId=${accountId}&from=2026-01-01`],
    ];
    for (const [name, args, path] of cases) {
      expect(dataOf(await callTool(book.app, name, args))).toEqual(await restJson(book.app, path));
    }
  } finally {
    book.close();
  }
});

test("tools that need today require asOf", async () => {
  const book = tempBook();
  try {
    const listed = await post(book.app, "tools/list", {});
    const tools = listed.body.result?.tools ?? [];
    for (const name of ["list_occurrences", "get_forecast", "get_insights", "get_hygiene"]) {
      const schema = tools.find((tool) => tool.name === name)?.inputSchema;
      expect(schema?.required).toContain("asOf");
      expect(schema?.properties?.asOf).toMatchObject({ format: "date", pattern: String.raw`^\d{4}-\d{2}-\d{2}$` });
    }
    expect(tools.find((tool) => tool.name === "list_accounts")?.inputSchema?.required ?? []).not.toContain("asOf");
    expect(tools.find((tool) => tool.name === "list_buckets")?.inputSchema?.required ?? []).not.toContain("asOf");
  } finally {
    book.close();
  }
});

test("date tools reject a call without asOf", async () => {
  const book = tempBook();
  try {
    const { bucketId } = seed(book.db, book.dir);
    for (const name of ["list_occurrences", "get_forecast", "get_insights", "get_hygiene"] as const) {
      const missing = await callTool(book.app, name, name === "list_occurrences" ? { id: bucketId } : {});
      expect(missing.result?.isError).toBe(true);
      expect(missing.result?.structuredContent).toEqual({ code: "as_of_required", params: {} });
    }
    const accounts = await callTool(book.app, "list_accounts", {});
    expect(accounts.error).toBeUndefined();
    expect(dataOf(accounts).items).toEqual((await restJson(book.app, "/api/accounts")).items);
  } finally {
    book.close();
  }
});

test("the money sentence is only on tools that carry amounts", async () => {
  const book = tempBook();
  try {
    const listed = await post(book.app, "tools/list", {});
    const tools = (listed.body.result?.tools ?? []) as { name: string; description?: string }[];
    const sentence = "Amounts are integer milliunits: 1000 is one unit of the book currency. Money that enters the account is positive.";
    function text(name: string): string {
      return tools.find((tool) => tool.name === name)?.description ?? "";
    }
    expect(text("get_health")).not.toContain("milliunits");
    expect(text("get_tags")).not.toContain("milliunits");
    expect(text("get_forecast")).toContain(sentence);
    expect(text("list_accounts")).toContain(sentence);
    expect(text("search_transactions")).toContain(sentence);
  } finally {
    book.close();
  }
});

test("an unknown tool or bad input returns an error code", async () => {
  const book = tempBook();
  try {
    seed(book.db, book.dir);
    const unknown = await callTool(book.app, "propose_transactions", {});
    expect(unknown.error?.code).toEqual(expect.any(Number));
    expect(unknown.result).toBeUndefined();

    const badDate = await callTool(book.app, "get_forecast", { asOf: "2026-02-31" });
    expect(badDate.result?.isError).toBe(true);
    expect(badDate.result?.structuredContent).toEqual({ code: "as_of_invalid", params: { asOf: "2026-02-31" } });

    const badPage = await callTool(book.app, "search_transactions", { page: 0 });
    expect(badPage.result?.isError).toBe(true);
    expect(badPage.result?.structuredContent).toEqual({ code: "invalid_query", params: { field: "page" } });

    const missingPlan = await callTool(book.app, "list_occurrences", {
      id: "00000000-0000-4000-8000-000000000001",
      asOf,
    });
    expect(missingPlan.result?.isError).toBe(true);
    expect(missingPlan.result?.structuredContent).toEqual({ code: "schedule_not_found", params: {} });
  } finally {
    book.close();
  }
});
