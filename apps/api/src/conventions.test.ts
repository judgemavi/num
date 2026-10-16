import { asOfQuerySchema, errorSchema, listQuerySchema, pagedResponseSchema } from "@num/shared";
import { createRoute, z } from "@hono/zod-openapi";
import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { createApp } from "./app";
import { createDb } from "./db";

const app = createApp(createDb(new Database(":memory:")));

const datedRoute = createRoute({
  method: "get",
  path: "/api/dated",
  request: {
    query: asOfQuerySchema,
  },
  responses: {
    200: {
      description: "The asOf date",
      content: {
        "application/json": {
          schema: z.object({ asOf: z.string() }),
        },
      },
    },
    400: {
      description: "The request is not valid",
      content: {
        "application/json": {
          schema: errorSchema,
        },
      },
    },
  },
});

const listRoute = createRoute({
  method: "get",
  path: "/api/items",
  request: {
    query: listQuerySchema(["date", "id"]),
  },
  responses: {
    200: {
      description: "A page of items",
      content: {
        "application/json": {
          schema: pagedResponseSchema(z.object({ id: z.string() })),
        },
      },
    },
    400: {
      description: "The request is not valid",
      content: {
        "application/json": {
          schema: errorSchema,
        },
      },
    },
  },
});

test("a date-dependent route without asOf returns 400", async () => {
  const app = createApp(createDb(new Database(":memory:")));
  app.openapi(datedRoute, (c) => c.json({ asOf: c.req.valid("query").asOf }, 200));

  const missing = await app.request("/api/dated");
  expect(missing.status).toBe(400);
  expect(await missing.json()).toEqual({ code: "as_of_required", params: {} });

  const invalid = await app.request("/api/dated?asOf=2025-02-29");
  expect(invalid.status).toBe(400);
  expect(await invalid.json()).toEqual({ code: "as_of_invalid", params: { asOf: "2025-02-29" } });

  const ok = await app.request("/api/dated?asOf=2026-10-07");
  expect(ok.status).toBe(200);
  expect(await ok.json()).toEqual({ asOf: "2026-10-07" });
});

test("health does not require asOf", async () => {
  const response = await app.request("/api/health");
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true });
});

test("sort with an unknown column returns 400", async () => {
  const app = createApp(createDb(new Database(":memory:")));
  app.openapi(listRoute, (c) => {
    const query = c.req.valid("query");
    return c.json({ items: [], page: query.page, pageSize: query.pageSize, total: 0 }, 200);
  });

  const unknown = await app.request("/api/items?sort=merchant");
  expect(unknown.status).toBe(400);
  expect(await unknown.json()).toEqual({ code: "sort_unknown", params: { sort: "merchant" } });

  const known = await app.request("/api/items?sort=date&dir=asc");
  expect(known.status).toBe(200);
  expect(await known.json()).toEqual({ items: [], page: 1, pageSize: 50, total: 0 });
});
