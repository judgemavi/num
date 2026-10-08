import { documentSchema, errorSchema } from "@num/shared";
import { createRoute, z, type OpenAPIHono } from "@hono/zod-openapi";
import type { Db } from "../db";
import { deleteDocument, readDocumentFile, uploadDocument } from "../services/documents";

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

const uploadRoute = createRoute({
  method: "post",
  path: "/api/documents",
  request: {
    body: {
      required: true,
      content: {
        "multipart/form-data": {
          schema: z.object({
            file: z.instanceof(File).openapi({ type: "string", format: "binary" }),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "The stored document",
      content: { "application/json": { schema: documentSchema } },
    },
    400: errorResponse,
  },
});

const downloadRoute = createRoute({
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

const deleteRoute = createRoute({
  method: "post",
  path: "/api/documents/{id}/delete",
  request: { params: idParams },
  responses: {
    200: {
      description: "The deleted document",
      content: { "application/json": { schema: documentSchema } },
    },
    404: errorResponse,
  },
});

function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7E]/g, "_");
  return `attachment; filename="${ascii}"`;
}

function responseBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy;
}

export function registerDocuments(app: OpenAPIHono, db: Db, dataDir: string) {
  app.openapi(uploadRoute, async (c) => {
    const { file } = c.req.valid("form");
    const document = uploadDocument(db, dataDir, {
      bytes: new Uint8Array(await file.arrayBuffer()),
      filename: file.name,
      mimeType: file.type,
      source: "ui",
    });
    return c.json(document, 200);
  });

  app.openapi(downloadRoute, (c) => {
    const { id } = c.req.valid("param");
    const file = readDocumentFile(db, dataDir, id);
    return c.body(responseBytes(file.bytes), 200, {
      "Content-Type": file.mimeType,
      "Content-Disposition": contentDisposition(file.filename),
    });
  });

  app.openapi(deleteRoute, (c) => {
    const { id } = c.req.valid("param");
    return c.json(deleteDocument(db, id, { source: "ui" }), 200);
  });
}
