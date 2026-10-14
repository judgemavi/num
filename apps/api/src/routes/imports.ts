import {
  columnMapSchema,
  importDetailSchema,
  importListSchema,
  importPresetListSchema,
  importResultSchema,
  importViewListSchema,
  importViewQuerySchema,
  importReviewResolveSchema,
  importReviewResultSchema,
  importUndoSchema,
  isoDateSchema,
} from "@num/shared";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { bodyLimit } from "hono/body-limit";
import type { Db } from "../db";
import { ServiceError } from "../service-error";
import { resolveImportReview } from "../services/import-review";
import { getImportDetail, listImportView } from "../services/import-list";
import { importStatement, listImportBatches, listImportPresets } from "../services/imports";
import { undoImportBatch } from "../services/import-undo";
import { validationHook } from "../validation";
import { errorResponse, idParams } from "./common";

const maxUploadBytes = 20 * 1024 * 1024;

const presetsRoute = createRoute({
  operationId: "get_import_presets",
  description: "Read bank presets. This does not create, change or delete a record. Amounts are integer milliunits: 1000 is one unit of the book currency. Money that enters the account is positive.",
  method: "get",
  path: "/api/import-presets",
  responses: {
    200: {
      description: "Bank presets",
      content: { "application/json": { schema: importPresetListSchema } },
    },
  },
});

const listRoute = createRoute({
  operationId: "get_accounts_id_imports",
  description: "Read accounts. This does not create, change or delete a record. Amounts are integer milliunits: 1000 is one unit of the book currency. Money that enters the account is positive.",
  method: "get",
  path: "/api/accounts/{id}/imports",
  request: { params: idParams },
  responses: {
    200: {
      description: "Import batches for an account",
      content: { "application/json": { schema: importListSchema } },
    },
    404: errorResponse,
  },
});

const importRoute = createRoute({
  operationId: "post_imports",
  description: "Import a statement file. This can create transactions, match existing transactions, skip duplicates and store the file. It does not change buckets, plans or the book currency. Amounts are integer milliunits: 1000 is one unit of the book currency. Money that enters the account is positive.",
  method: "post",
  path: "/api/imports",
  request: {
    body: {
      required: true,
      content: {
        "multipart/form-data": {
          schema: z.object({
            file: z.instanceof(File).openapi({ type: "string", format: "binary" }),
            accountId: z.uuid(),
            asOf: isoDateSchema,
            presetId: z.string().optional(),
            columnMap: z.string().optional(),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "The import result",
      content: { "application/json": { schema: importResultSchema } },
    },
    400: errorResponse,
    404: errorResponse,
    413: errorResponse,
  },
});

const reviewRoute = createRoute({
  operationId: "post_imports_rows_id_resolve",
  description: "Create or run imports (resolve). This does not change records outside this action. Amounts are integer milliunits: 1000 is one unit of the book currency. Money that enters the account is positive.",
  method: "post",
  path: "/api/imports/rows/{id}/resolve",
  request: {
    params: idParams,
    body: { required: true, content: { "application/json": { schema: importReviewResolveSchema } } },
  },
  responses: {
    200: {
      description: "The review decision",
      content: { "application/json": { schema: importReviewResultSchema } },
    },
    400: errorResponse,
    404: errorResponse,
    409: errorResponse,
  },
});

const viewRoute = createRoute({
  operationId: "list_imports",
  description: "Read imports. This does not create, change or delete a record. Amounts are integer milliunits: 1000 is one unit of the book currency. Money that enters the account is positive.",
  method: "get",
  path: "/api/imports",
  request: { query: importViewQuerySchema },
  responses: {
    200: {
      description: "One page of import batches",
      content: { "application/json": { schema: importViewListSchema } },
    },
    400: errorResponse,
  },
});

const detailRoute = createRoute({
  operationId: "get_imports_id",
  description: "Read imports. This does not create, change or delete a record. Amounts are integer milliunits: 1000 is one unit of the book currency. Money that enters the account is positive.",
  method: "get",
  path: "/api/imports/{id}",
  request: { params: idParams },
  responses: {
    200: {
      description: "One import and its rows",
      content: { "application/json": { schema: importDetailSchema } },
    },
    404: errorResponse,
  },
});

const undoRoute = createRoute({
  operationId: "post_imports_id_undo",
  description: "Undo imports (undo). This reverses that change. It does not remove the audit log. Amounts are integer milliunits: 1000 is one unit of the book currency. Money that enters the account is positive.",
  method: "post",
  path: "/api/imports/{id}/undo",
  request: { params: idParams },
  responses: {
    200: {
      description: "The undone import",
      content: { "application/json": { schema: importUndoSchema } },
    },
    404: errorResponse,
  },
});

function blankToNull(value: string | undefined) {
  const text = value?.trim() ?? "";
  return text.length > 0 ? text : null;
}

function readColumnMap(value: string | undefined) {
  const text = value?.trim() ?? "";
  if (text.length === 0) {
    return null;
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new ServiceError("invalid_body", 400, { field: "columnMap" });
  }
  const parsed = columnMapSchema.safeParse(json);
  if (!parsed.success) {
    throw new ServiceError("invalid_body", 400, { field: "columnMap" });
  }
  return parsed.data;
}

export function importRoutes(db: Db, dataDir: string) {
  const app = new OpenAPIHono({ defaultHook: validationHook });
  app.use(
    "/api/imports",
    bodyLimit({
      maxSize: maxUploadBytes,
      onError: (c) => c.json({ code: "document_too_large" as const, params: {} }, 413),
    }),
  );
  return app
    .openapi(presetsRoute, (c) => c.json(listImportPresets(), 200))
    .openapi(viewRoute, (c) => c.json(listImportView(db, c.req.valid("query")), 200))
    .openapi(detailRoute, (c) => c.json(getImportDetail(db, c.req.valid("param").id), 200))
    .openapi(listRoute, (c) => {
      const { id } = c.req.valid("param");
      return c.json(listImportBatches(db, id), 200);
    })
    .openapi(importRoute, async (c) => {
      const body = c.req.valid("form");
      const result = importStatement(db, dataDir, {
        accountId: body.accountId,
        filename: body.file.name,
        mimeType: body.file.type,
        bytes: new Uint8Array(await body.file.arrayBuffer()),
        presetId: blankToNull(body.presetId),
        columnMap: readColumnMap(body.columnMap),
        asOf: body.asOf,
        source: "import",
      });
      return c.json(result, 200);
    })
    .openapi(reviewRoute, (c) => {
      const { id } = c.req.valid("param");
      return c.json(resolveImportReview(db, id, c.req.valid("json"), { source: "import" }), 200);
    })
    .openapi(undoRoute, (c) => {
      const { id } = c.req.valid("param");
      return c.json(undoImportBatch(db, id, { source: "import" }), 200);
    });
}

export type ImportRoutes = ReturnType<typeof importRoutes>;
