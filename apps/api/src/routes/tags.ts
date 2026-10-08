import { errorSchema, tagCreateSchema, tagListQuerySchema, tagListSchema, tagSchema, tagUpdateSchema } from "@num/shared";
import { createRoute, z, type OpenAPIHono } from "@hono/zod-openapi";
import type { Db } from "../db";
import { archiveTag, createTag, listTags, restoreTag, updateTag } from "../services/tags";

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

const listRoute = createRoute({
  method: "get",
  path: "/api/tags",
  request: { query: tagListQuerySchema },
  responses: {
    200: {
      description: "Tags",
      content: { "application/json": { schema: tagListSchema } },
    },
    400: errorResponse,
  },
});

const createRouteDef = createRoute({
  method: "post",
  path: "/api/tags",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: tagCreateSchema } },
    },
  },
  responses: {
    200: {
      description: "The created tag",
      content: { "application/json": { schema: tagSchema } },
    },
    400: errorResponse,
    409: errorResponse,
  },
});

const updateRoute = createRoute({
  method: "patch",
  path: "/api/tags/{id}",
  request: {
    params: idParams,
    body: {
      required: true,
      content: { "application/json": { schema: tagUpdateSchema } },
    },
  },
  responses: {
    200: {
      description: "The updated tag",
      content: { "application/json": { schema: tagSchema } },
    },
    400: errorResponse,
    404: errorResponse,
    409: errorResponse,
  },
});

const restoreRoute = createRoute({
  method: "post",
  path: "/api/tags/{id}/restore",
  request: { params: idParams },
  responses: {
    200: {
      description: "The restored tag",
      content: { "application/json": { schema: tagSchema } },
    },
    404: errorResponse,
    409: errorResponse,
  },
});

const archiveRoute = createRoute({
  method: "post",
  path: "/api/tags/{id}/archive",
  request: { params: idParams },
  responses: {
    200: {
      description: "The archived tag",
      content: { "application/json": { schema: tagSchema } },
    },
    404: errorResponse,
    409: errorResponse,
  },
});

export function registerTags(app: OpenAPIHono, db: Db) {
  app.openapi(listRoute, (c) => c.json(listTags(db, c.req.valid("query")), 200));
  app.openapi(createRouteDef, (c) => {
    const body = c.req.valid("json");
    return c.json(createTag(db, { ...body, source: "ui" }), 200);
  });
  app.openapi(updateRoute, (c) => {
    const body = c.req.valid("json");
    const { id } = c.req.valid("param");
    return c.json(updateTag(db, id, { ...body, source: "ui" }), 200);
  });
  app.openapi(archiveRoute, (c) => {
    const { id } = c.req.valid("param");
    return c.json(archiveTag(db, id, { source: "ui" }), 200);
  });
  app.openapi(restoreRoute, (c) => {
    const { id } = c.req.valid("param");
    return c.json(restoreTag(db, id, { source: "ui" }), 200);
  });
}
