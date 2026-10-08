import {
  categoryCreateSchema,
  categoryGroupCreateSchema,
  categoryGroupDeleteSchema,
  categoryGroupListSchema,
  categoryGroupOrderSchema,
  categoryGroupSchema,
  categoryGroupUpdateSchema,
  categoryListQuerySchema,
  categoryListSchema,
  categorySchema,
  categoryUpdateSchema,
  errorSchema,
} from "@num/shared";
import { createRoute, z, type OpenAPIHono } from "@hono/zod-openapi";
import type { Db } from "../db";
import {
  archiveCategory,
  createCategory,
  createCategoryGroup,
  deleteCategoryGroup,
  listCategories,
  listCategoryGroups,
  reorderCategoryGroups,
  restoreCategory,
  updateCategory,
  updateCategoryGroup,
} from "../services/categories";

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

const listGroupsRoute = createRoute({
  method: "get",
  path: "/api/category-groups",
  responses: {
    200: {
      description: "Category groups",
      content: { "application/json": { schema: categoryGroupListSchema } },
    },
  },
});

const createGroupRoute = createRoute({
  method: "post",
  path: "/api/category-groups",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: categoryGroupCreateSchema } },
    },
  },
  responses: {
    200: {
      description: "The created group",
      content: { "application/json": { schema: categoryGroupSchema } },
    },
    400: errorResponse,
  },
});

const updateGroupRoute = createRoute({
  method: "patch",
  path: "/api/category-groups/{id}",
  request: {
    params: idParams,
    body: {
      required: true,
      content: { "application/json": { schema: categoryGroupUpdateSchema } },
    },
  },
  responses: {
    200: {
      description: "The updated group",
      content: { "application/json": { schema: categoryGroupSchema } },
    },
    400: errorResponse,
    404: errorResponse,
  },
});

const deleteGroupRoute = createRoute({
  method: "delete",
  path: "/api/category-groups/{id}",
  request: { params: idParams },
  responses: {
    200: {
      description: "The group was deleted",
      content: { "application/json": { schema: categoryGroupDeleteSchema } },
    },
    404: errorResponse,
  },
});

const orderGroupsRoute = createRoute({
  method: "post",
  path: "/api/category-groups/order",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: categoryGroupOrderSchema } },
    },
  },
  responses: {
    200: {
      description: "Category groups in the new order",
      content: { "application/json": { schema: categoryGroupListSchema } },
    },
    400: errorResponse,
  },
});

const listCategoriesRoute = createRoute({
  method: "get",
  path: "/api/categories",
  request: { query: categoryListQuerySchema },
  responses: {
    200: {
      description: "Categories",
      content: { "application/json": { schema: categoryListSchema } },
    },
    400: errorResponse,
  },
});

const createCategoryRoute = createRoute({
  method: "post",
  path: "/api/categories",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: categoryCreateSchema } },
    },
  },
  responses: {
    200: {
      description: "The created category",
      content: { "application/json": { schema: categorySchema } },
    },
    400: errorResponse,
    404: errorResponse,
    409: errorResponse,
  },
});

const updateCategoryRoute = createRoute({
  method: "patch",
  path: "/api/categories/{id}",
  request: {
    params: idParams,
    body: {
      required: true,
      content: { "application/json": { schema: categoryUpdateSchema } },
    },
  },
  responses: {
    200: {
      description: "The updated category",
      content: { "application/json": { schema: categorySchema } },
    },
    400: errorResponse,
    404: errorResponse,
    409: errorResponse,
  },
});

const restoreCategoryRoute = createRoute({
  method: "post",
  path: "/api/categories/{id}/restore",
  request: { params: idParams },
  responses: {
    200: {
      description: "The restored category",
      content: { "application/json": { schema: categorySchema } },
    },
    404: errorResponse,
    409: errorResponse,
  },
});

const archiveCategoryRoute = createRoute({
  method: "post",
  path: "/api/categories/{id}/archive",
  request: { params: idParams },
  responses: {
    200: {
      description: "The archived category",
      content: { "application/json": { schema: categorySchema } },
    },
    404: errorResponse,
    409: errorResponse,
  },
});

export function registerCategories(app: OpenAPIHono, db: Db) {
  app.openapi(listGroupsRoute, (c) => c.json(listCategoryGroups(db), 200));
  app.openapi(orderGroupsRoute, (c) => {
    const body = c.req.valid("json");
    return c.json(reorderCategoryGroups(db, body.ids, { source: "ui" }), 200);
  });
  app.openapi(createGroupRoute, (c) => {
    const body = c.req.valid("json");
    return c.json(createCategoryGroup(db, { ...body, source: "ui" }), 200);
  });
  app.openapi(updateGroupRoute, (c) => {
    const body = c.req.valid("json");
    const { id } = c.req.valid("param");
    return c.json(updateCategoryGroup(db, id, { ...body, source: "ui" }), 200);
  });
  app.openapi(deleteGroupRoute, (c) => {
    const { id } = c.req.valid("param");
    deleteCategoryGroup(db, id, { source: "ui" });
    return c.json({ ok: true as const }, 200);
  });

  app.openapi(listCategoriesRoute, (c) => c.json(listCategories(db, c.req.valid("query")), 200));
  app.openapi(createCategoryRoute, (c) => {
    const body = c.req.valid("json");
    return c.json(createCategory(db, { ...body, source: "ui" }), 200);
  });
  app.openapi(updateCategoryRoute, (c) => {
    const body = c.req.valid("json");
    const { id } = c.req.valid("param");
    return c.json(updateCategory(db, id, { ...body, source: "ui" }), 200);
  });
  app.openapi(archiveCategoryRoute, (c) => {
    const { id } = c.req.valid("param");
    return c.json(archiveCategory(db, id, { source: "ui" }), 200);
  });
  app.openapi(restoreCategoryRoute, (c) => {
    const { id } = c.req.valid("param");
    return c.json(restoreCategory(db, id, { source: "ui" }), 200);
  });
}
