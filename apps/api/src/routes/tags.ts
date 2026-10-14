import { tagCreateSchema, tagListQuerySchema, tagListSchema, tagSchema, tagUpdateSchema } from "@num/shared";
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import type { Db } from "../db";
import { archiveTag, createTag, getTag, listTags, restoreTag, updateTag } from "../services/tags";
import { validationHook } from "../validation";
import { errorResponse, idParams } from "./common";

const listRoute = createRoute({
  operationId: "get_tags",
  description: "Read tags. This does not create, change or delete a record. Amounts are integer milliunits: 1000 is one unit of the book currency. Money that enters the account is positive.",
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
  operationId: "post_tags",
  description: "Create or run tags. This does not change records outside this action. Amounts are integer milliunits: 1000 is one unit of the book currency. Money that enters the account is positive.",
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
  operationId: "patch_tags_id",
  description: "Change tags. Send only the fields that change. A field that you leave out keeps its value. This does not change records outside this action. Amounts are integer milliunits: 1000 is one unit of the book currency. Money that enters the account is positive.",
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
  operationId: "post_tags_id_restore",
  description: "Restore tags (restore). This does not change records of another kind. Amounts are integer milliunits: 1000 is one unit of the book currency. Money that enters the account is positive.",
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
  operationId: "post_tags_id_archive",
  description: "Remove or archive tags (archive). This does not change records of another kind. Amounts are integer milliunits: 1000 is one unit of the book currency. Money that enters the account is positive.",
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

const readRoute = createRoute({
  operationId: "get_tags_id",
  description: "Read tags. This does not create, change or delete a record. Amounts are integer milliunits: 1000 is one unit of the book currency. Money that enters the account is positive.",
  method: "get",
  path: "/api/tags/{id}",
  request: { params: idParams },
  responses: {
    200: { description: "One tag", content: { "application/json": { schema: tagSchema } } },
    404: errorResponse,
  },
});

export function tagRoutes(db: Db) {
  return new OpenAPIHono({ defaultHook: validationHook })
    .openapi(listRoute, (c) => c.json(listTags(db, c.req.valid("query")), 200))
    .openapi(readRoute, (c) => c.json(getTag(db, c.req.valid("param").id), 200))
    .openapi(createRouteDef, (c) => {
      const body = c.req.valid("json");
      return c.json(createTag(db, { ...body, source: "ui" }), 200);
    })
    .openapi(updateRoute, (c) => {
      const body = c.req.valid("json");
      const { id } = c.req.valid("param");
      return c.json(updateTag(db, id, { ...body, source: "ui" }), 200);
    })
    .openapi(archiveRoute, (c) => {
      const { id } = c.req.valid("param");
      return c.json(archiveTag(db, id, { source: "ui" }), 200);
    })
    .openapi(restoreRoute, (c) => {
      const { id } = c.req.valid("param");
      return c.json(restoreTag(db, id, { source: "ui" }), 200);
    });
}

export type TagRoutes = ReturnType<typeof tagRoutes>;
