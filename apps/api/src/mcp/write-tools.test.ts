import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { auditLog, migrateDatabase, openDatabase, proposals } from "@num/db";
import { columnMapSchema, type ColumnMap } from "@num/shared";
import { expect, test } from "bun:test";
import type { OpenAPIHono } from "@hono/zod-openapi";
import type { Database } from "bun:sqlite";
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
    content?: { type: string; text: string }[];
    tools?: { name: string; description?: string; annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean } }[];
  };
  error?: { code: number; message: string };
};

type PreviewBody = {
  preview: { groups: { entity: string; action: string; count: number }[]; rows: { entity: string; action: string; before: unknown; after: unknown }[] };
  response: Record<string, unknown>;
  token: string;
};

function tempBook() {
  const dir = mkdtempSync(join(tmpdir(), "num-mcp-write-"));
  const sqlite = openDatabase(join(dir, "num.sqlite"));
  migrateDatabase(sqlite);
  const db = createDb(sqlite);
  runSetup(db, { currency: "CAD", categorySet: "default", ...saved });
  const app = createApp(db, { dataDir: dir });
  return {
    dir,
    db,
    sqlite,
    app,
    close() {
      sqlite.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

function allowWrites(db: Db) {
  changeAiAccess(db, { aiCanWrite: true, ...saved });
}

function tableCounts(sqlite: Database): Record<string, number> {
  const names = sqlite
    .query("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .all() as { name: string }[];
  const counts: Record<string, number> = {};
  for (const { name } of names) {
    const row = sqlite.query(`SELECT count(*) AS n FROM "${name}"`).get() as { n: number };
    counts[name] = Number(row.n);
  }
  return counts;
}

function expectOperationRolledBack(before: Record<string, number>, after: Record<string, number>) {
  for (const [name, count] of Object.entries(before)) {
    if (name === "proposals" || name === "audit_log") {
      expect(after[name]).toBe(count + 1);
    } else {
      expect(after[name]).toBe(count);
    }
  }
}

function uploads(dir: string): string[] {
  const folder = join(dir, "uploads");
  return existsSync(folder) ? readdirSync(folder) : [];
}

function norm(value: unknown): unknown {
  if (typeof value === "string") {
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
      return "id";
    }
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
      return "time";
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => norm(item));
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, norm(item)]));
  }
  return value;
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
  return data;
}

function previewOf(body: Rpc): PreviewBody {
  return dataOf(body) as PreviewBody;
}

test("every route has a tool when AI writes are on", async () => {
  const book = tempBook();
  try {
    allowWrites(book.db);
    const listed = await post(book.app, "tools/list", {});
    const tools = listed.body.result?.tools ?? [];
    const names = tools.map((tool) => tool.name).sort();
    expect(names).toEqual(mcpRoutes(book.app).map((route) => route.operationId).sort());
    for (const tool of tools) {
      expect(tool.description).toContain("minor units");
      expect(tool.description).toContain("positive");
    }
    expect(tools.find((tool) => tool.name === "get_forecast")?.annotations?.readOnlyHint).toBe(true);
    expect(tools.find((tool) => tool.name === "delete_transactions_id")?.annotations?.destructiveHint).toBe(true);
    expect(tools.find((tool) => tool.name === "post_imports")?.annotations?.destructiveHint).toBe(true);
  } finally {
    book.close();
  }
});

test("a write without a token stores only the proposal and the preview matches the apply", async () => {
  const book = tempBook();
  try {
    allowWrites(book.db);
    const before = tableCounts(book.sqlite);
    const preview = previewOf(await callTool(book.app, "post_tags", { name: "Trip" }));
    expectOperationRolledBack(before, tableCounts(book.sqlite));
    expect(uploads(book.dir)).toEqual([]);
    expect(preview.token.length).toBeGreaterThan(10);
    expect(preview.preview.groups).toEqual([{ entity: "tags", action: "create", count: 1 }]);

    const applied = dataOf(await callTool(book.app, "post_tags", { name: "Trip", token: preview.token }));
    expect(applied.name).toBe("Trip");
    const tagRows = book.db
      .select()
      .from(auditLog)
      .all()
      .filter((row) => row.entity === "tags")
      .map((row) => ({
        entity: row.entity,
        action: row.action,
        before: row.before === null ? null : JSON.parse(row.before),
        after: row.after === null ? null : JSON.parse(row.after),
      }));
    expect(norm(tagRows)).toEqual(norm(preview.preview.rows));
    expect(book.db.select().from(proposals).all()).toEqual([
      expect.objectContaining({ kind: "post_tags", status: "applied", resultRef: applied.id }),
    ]);
  } finally {
    book.close();
  }
});

test("a reused, expired or altered token is refused", async () => {
  const book = tempBook();
  try {
    allowWrites(book.db);
    const preview = previewOf(await callTool(book.app, "post_tags", { name: "Trip" }));
    const changed = await callTool(book.app, "post_tags", { name: "Other", token: preview.token });
    expect(changed.result?.structuredContent).toEqual({ code: "inputs_changed", params: {} });
    expect(book.db.select().from(proposals).all()[0]?.status).toBe("pending");

    book.db.update(proposals).set({ expiresAt: "2020-01-01T00:00:00Z" }).where(eq(proposals.status, "pending")).run();
    const expired = await callTool(book.app, "post_tags", { name: "Trip", token: preview.token });
    expect(expired.result?.structuredContent).toEqual({ code: "token_expired", params: {} });
    expect(book.db.select().from(proposals).all()[0]?.status).toBe("expired");

    const again = previewOf(await callTool(book.app, "post_tags", { name: "Trip" }));
    expect(dataOf(await callTool(book.app, "post_tags", { name: "Trip", token: again.token })).name).toBe("Trip");
    const reused = await callTool(book.app, "post_tags", { name: "Trip", token: again.token });
    expect(reused.result?.structuredContent).toEqual({ code: "token_used", params: {} });
  } finally {
    book.close();
  }
});

test("aiCanWrite false hides and refuses writes", async () => {
  const book = tempBook();
  try {
    const before = tableCounts(book.sqlite);
    const listed = await post(book.app, "tools/list", {});
    const tools = listed.body.result?.tools ?? [];
    expect(tools.length).toBeGreaterThan(0);
    expect(tools.every((tool) => tool.annotations?.readOnlyHint === true)).toBe(true);
    expect(tools.some((tool) => tool.name === "post_tags")).toBe(false);
    const refused = await callTool(book.app, "post_tags", { name: "Trip" });
    expect(refused.result?.isError === true || refused.error !== undefined).toBe(true);
    expect(tableCounts(book.sqlite)).toEqual(before);
    expect(uploads(book.dir)).toEqual([]);
  } finally {
    book.close();
  }
});

test("import preview shows created, matched and duplicate counts and apply matches it", async () => {
  const book = tempBook();
  try {
    allowWrites(book.db);
    const account = createAccount(book.db, {
      name: "Everyday",
      kind: "chequing",
      openingDate: "2026-01-01",
      openingBalance: 0,
      ...saved,
    });
    const csv = "date,description,amount\n03/04/2026,CITY TRANSIT,-2.00\n03/05/2026,PAY DEPOSIT,20.00\n";
    const args = {
      accountId: account.id,
      asOf,
      columnMap: JSON.stringify(map),
      file: {
        filename: "march.csv",
        mimeType: "text/csv",
        contentBase64: Buffer.from(csv).toString("base64"),
      },
    };
    const before = tableCounts(book.sqlite);
    const filesBefore = uploads(book.dir);
    const preview = previewOf(await callTool(book.app, "post_imports", args));
    expectOperationRolledBack(before, tableCounts(book.sqlite));
    expect(uploads(book.dir)).toEqual(filesBefore);
    const counts = (preview.response.counts ?? {}) as Record<string, number>;
    expect(counts.created).toBe(2);
    expect(counts.matched).toBe(0);
    expect(counts.duplicate).toBe(0);
    const applied = dataOf(await callTool(book.app, "post_imports", { ...args, token: preview.token }));
    expect(applied.counts).toEqual(preview.response.counts);
    expect(uploads(book.dir).length).toBe(filesBefore.length + 1);
  } finally {
    book.close();
  }
});
