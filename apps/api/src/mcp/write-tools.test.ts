import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { auditLog, migrateDatabase, openDatabase } from "@num/db";
import { columnMapSchema, type ColumnMap } from "@num/shared";
import { expect, test } from "bun:test";
import type { OpenAPIHono } from "@hono/zod-openapi";
import { eq } from "drizzle-orm";
import { createApp } from "../app";
import { createDb, type Db } from "../db";
import { createAccount } from "../services/accounts";
import { changeAiAccess } from "../services/ai-access";
import { runSetup } from "../services/setup";
import { mcpRoutes } from "./catalog";

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
    tools?: { name: string; annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean } }[];
  };
  error?: { code: number; message: string };
};

function tempBook() {
  const dir = mkdtempSync(join(tmpdir(), "num-mcp-write-"));
  const sqlite = openDatabase(join(dir, "num.sqlite"));
  migrateDatabase(sqlite);
  const db = createDb(sqlite);
  runSetup(db, { asOf: "2026-10-07", currency: "CAD", categorySet: "default", ...saved });
  return {
    dir,
    db,
    app: createApp(db, "127.0.0.1"),
    close() {
      sqlite.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

function allowWrites(db: Db) {
  changeAiAccess(db, { aiCanWrite: true, ...saved });
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
  const payload = text.includes("data: ")
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
  return data;
}

test("every permitted route has a tool when AI writes are on", async () => {
  const book = tempBook();
  try {
    allowWrites(book.db);
    const listed = await post(book.app, "tools/list", {});
    const tools = listed.body.result?.tools ?? [];
    expect(tools.map((tool) => tool.name).sort()).toEqual(mcpRoutes(book.app).map((route) => route.operationId).sort());
    expect(tools.some((tool) => tool.name === "patch_ai_access")).toBe(false);
    expect(tools.some((tool) => tool.name === "get_ai_access")).toBe(true);
    const refused = await callTool(book.app, "patch_ai_access", { aiCanWrite: false });
    expect(refused.result?.isError === true || refused.error !== undefined).toBe(true);
    expect(dataOf(await callTool(book.app, "get_ai_access", {}))).toMatchObject({ aiCanWrite: true });
    expect(tools.find((tool) => tool.name === "get_forecast")?.annotations?.readOnlyHint).toBe(true);
    expect(tools.find((tool) => tool.name === "post_imports")?.annotations?.destructiveHint).toBe(true);
    expect(tools.find((tool) => tool.name === "delete_transactions_id")?.annotations?.destructiveHint).toBe(true);
    expect(tools.find((tool) => tool.name === "post_transactions_approve")?.annotations?.destructiveHint).toBe(true);
  } finally {
    book.close();
  }
});

test("a write tool returns the same data as REST and audits source mcp", async () => {
  const mcpBook = tempBook();
  const restBook = tempBook();
  try {
    allowWrites(mcpBook.db);
    const mcp = dataOf(await callTool(mcpBook.app, "post_tags", { name: "Trip" }));
    const restResponse = await restBook.app.request("/api/tags", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Trip" }),
    });
    expect(restResponse.status).toBe(200);
    const rest = (await restResponse.json()) as { name: string; archivedAt: string | null };
    expect(mcp.name).toBe(rest.name);
    expect(mcp.archivedAt).toBe(rest.archivedAt);
    const audit = mcpBook.db.select().from(auditLog).where(eq(auditLog.entity, "tags")).all();
    expect(audit.map((row) => row.source)).toEqual(["mcp"]);
  } finally {
    mcpBook.close();
    restBook.close();
  }
});

test("aiCanWrite false hides and refuses writes", async () => {
  const book = tempBook();
  try {
    const before = book.db.select().from(auditLog).all().length;
    const listed = await post(book.app, "tools/list", {});
    const tools = listed.body.result?.tools ?? [];
    expect(tools.length).toBeGreaterThan(0);
    expect(tools.every((tool) => tool.annotations?.readOnlyHint === true)).toBe(true);
    expect(tools.some((tool) => tool.name === "post_tags")).toBe(false);
    const refused = await callTool(book.app, "post_tags", { name: "Trip" });
    expect(refused.result?.isError === true || refused.error !== undefined).toBe(true);
    expect(book.db.select().from(auditLog).all().length).toBe(before);
  } finally {
    book.close();
  }
});

test("a CSV upload through MCP imports like the UI", async () => {
  const mcpBook = tempBook();
  const restBook = tempBook();
  try {
    allowWrites(mcpBook.db);
    const mcpAccount = createAccount(mcpBook.db, {
      asOf: "2026-10-07",
      name: "Everyday",
      kind: "chequing",
      openingDate: "2026-01-01",
      openingBalance: 0,
      ...saved,
    });
    const restAccount = createAccount(restBook.db, {
      asOf: "2026-10-07",
      name: "Everyday",
      kind: "chequing",
      openingDate: "2026-01-01",
      openingBalance: 0,
      ...saved,
    });
    const csv = "date,description,amount\n03/04/2026,CITY TRANSIT,-2.00\n03/05/2026,PAY DEPOSIT,20.00\n";
    const mcp = dataOf(
      await callTool(mcpBook.app, "post_imports", {
        accountId: mcpAccount.id,
        asOf,
        columnMap: JSON.stringify(map),
        file: { filename: "march.csv", mimeType: "text/csv", text: csv },
      }),
    );
    const form = new FormData();
    form.set("file", new File([csv], "march.csv", { type: "text/csv" }));
    form.set("accountId", restAccount.id);
    form.set("asOf", asOf);
    form.set("columnMap", JSON.stringify(map));
    const restResponse = await restBook.app.request("/api/imports", { method: "POST", body: form });
    expect(restResponse.status).toBe(200);
    const rest = (await restResponse.json()) as { counts: Record<string, number> };
    expect(mcp.counts).toEqual(rest.counts);
    expect(rest.counts).toEqual({ created: 2, matched: 0, duplicate: 0, needsReview: 0, unreadable: 0 });
  } finally {
    mcpBook.close();
    restBook.close();
  }
});
