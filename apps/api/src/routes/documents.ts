import { documentSchema } from "@num/shared";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import type { Db } from "../db";
import { eraseDocument, readDocumentFile } from "../services/documents";
import { validationHook } from "../validation";
import { errorResponse, idParams } from "./common";

const downloadRoute = createRoute({
  operationId: "get_documents_id",
  description: "Read documents. This does not create, change or delete a record. An erased document answers 404. Amounts are integer milliunits: 1000 is one unit of the book currency. Money that enters the account is positive.",
  method: "get",
  path: "/api/documents/{id}",
  request: { params: idParams },
  responses: {
    200: {
      description: "The document file",
      content: {
        "application/octet-stream": {
          schema: z.string(),
        },
      },
    },
    404: errorResponse,
  },
});

const eraseRoute = createRoute({
  operationId: "delete_documents_id",
  description: "Erase the file of a document. The document record (filename, hash, upload time) stays with the erased time in deletedAt, for the audit log. The import and its transactions stay. A new import of the same file stores it again. Amounts are integer milliunits: 1000 is one unit of the book currency. Money that enters the account is positive.",
  method: "delete",
  path: "/api/documents/{id}",
  request: { params: idParams },
  responses: {
    200: {
      description: "The document record after the file is erased",
      content: { "application/json": { schema: documentSchema } },
    },
    404: errorResponse,
  },
});

function contentDisposition(filename: string) {
  const ascii = filename.replace(/[^\x20-\x7E]/g, "_");
  return `attachment; filename="${ascii}"`;
}

function responseBytes(bytes: Uint8Array) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy;
}

export function documentRoutes(db: Db, dataDir: string) {
  return new OpenAPIHono({ defaultHook: validationHook })
    .openapi(downloadRoute, (c) => {
      const { id } = c.req.valid("param");
      const file = readDocumentFile(db, dataDir, id);
      return c.body(responseBytes(file.bytes), 200, {
        "Content-Type": file.mimeType,
        "Content-Disposition": contentDisposition(file.filename),
      });
    })
    .openapi(eraseRoute, (c) => {
      const { id } = c.req.valid("param");
      return c.json(eraseDocument(db, dataDir, id, { source: "ui" }), 200);
    });
}
