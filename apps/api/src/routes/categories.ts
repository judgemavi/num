import {
  categoryCreateSchema,
  categoryGroupCreateSchema,
  categoryGroupDeleteSchema,
  categoryGroupListSchema,
  categoryGroupSchema,
  categoryGroupUpdateSchema,
  categoryListQuerySchema,
  categoryListSchema,
  categorySchema,
  categoryUpdateSchema,
} from "@num/shared";
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import type { Db } from "../db";
import {
  archiveCategory,
  createCategory,
  createCategoryGroup,
  deleteCategoryGroup,
  getCategory,
  getCategoryGroup,
  listCategories,
  listCategoryGroups,
  restoreCategory,
  updateCategory,
  updateCategoryGroup,
} from "../services/categories";
import { validationHook } from "../validation";
import { errorResponse, idParams } from "./common";

const listGroupsRoute = createRoute({
  operationId: "list_category_groups",
  description: "Read category groups. This does not create, change or delete a record. Amounts are integer milliunits: 1000 is one unit of the book currency. Money that enters the account is positive.",
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
  operationId: "post_category_groups",
  description: "Create or run category groups. This does not change records outside this action. Amounts are integer milliunits: 1000 is one unit of the book currency. Money that enters the account is positive.",
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
    409: errorResponse,
  },
});

const updateGroupRoute = createRoute({
  operationId: "patch_category_groups_id",
  description: "Change category groups. Send only the fields that change. A field that you leave out keeps its value. This does not change records outside this action. Amounts are integer milliunits: 1000 is one unit of the book currency. Money that enters the account is positive.",
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
    409: errorResponse,
  },
});

const deleteGroupRoute = createRoute({
  operationId: "delete_category_groups_id",
  description: "Remove or archive category groups. This does not change records of another kind. Amounts are integer milliunits: 1000 is one unit of the book currency. Money that enters the account is positive.",
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

const listCategoriesRoute = createRoute({
  operationId: "list_categories",
  description: "Read categories. This does not create, change or delete a record. Amounts are integer milliunits: 1000 is one unit of the book currency. Money that enters the account is positive.",
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
  operationId: "post_categories",
  description: "Create or run categories. This does not change records outside this action. Amounts are integer milliunits: 1000 is one unit of the book currency. Money that enters the account is positive.",
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
  operationId: "patch_categories_id",
  description: "Change categories. Send only the fields that change. A field that you leave out keeps its value. null clears a field that can be empty. The API checks the fields together on the stored record with your changes. This does not change records outside this action. Amounts are integer milliunits: 1000 is one unit of the book currency. Money that enters the account is positive.",
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
  operationId: "post_categories_id_restore",
  description: "Restore categories (restore). This does not change records of another kind. Amounts are integer milliunits: 1000 is one unit of the book currency. Money that enters the account is positive.",
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
  operationId: "post_categories_id_archive",
  description: "Remove or archive categories (archive). This does not change records of another kind. Amounts are integer milliunits: 1000 is one unit of the book currency. Money that enters the account is positive.",
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

const readGroupRoute = createRoute({
  operationId: "get_category_groups_id",
  description: "Read category groups. This does not create, change or delete a record. Amounts are integer milliunits: 1000 is one unit of the book currency. Money that enters the account is positive.",
  method: "get",
  path: "/api/category-groups/{id}",
  request: { params: idParams },
  responses: {
    200: { description: "One category group", content: { "application/json": { schema: categoryGroupSchema } } },
    404: errorResponse,
  },
});

const readCategoryRoute = createRoute({
  operationId: "get_categories_id",
  description: "Read categories. This does not create, change or delete a record. Amounts are integer milliunits: 1000 is one unit of the book currency. Money that enters the account is positive.",
  method: "get",
  path: "/api/categories/{id}",
  request: { params: idParams },
  responses: {
    200: { description: "One category", content: { "application/json": { schema: categorySchema } } },
    404: errorResponse,
  },
});

export function categoryRoutes(db: Db) {
  return new OpenAPIHono({ defaultHook: validationHook })
    .openapi(listGroupsRoute, (c) => c.json(listCategoryGroups(db), 200))
    .openapi(readGroupRoute, (c) => c.json(getCategoryGroup(db, c.req.valid("param").id), 200))
    .openapi(createGroupRoute, (c) => {
      const body = c.req.valid("json");
      return c.json(createCategoryGroup(db, { ...body, source: "ui" }), 200);
    })
    .openapi(updateGroupRoute, (c) => {
      const body = c.req.valid("json");
      const { id } = c.req.valid("param");
      return c.json(updateCategoryGroup(db, id, { ...body, source: "ui" }), 200);
    })
    .openapi(deleteGroupRoute, (c) => {
      const { id } = c.req.valid("param");
      deleteCategoryGroup(db, id, { source: "ui" });
      return c.json({ ok: true as const }, 200);
    })
    .openapi(listCategoriesRoute, (c) => c.json(listCategories(db, c.req.valid("query")), 200))
    .openapi(readCategoryRoute, (c) => c.json(getCategory(db, c.req.valid("param").id), 200))
    .openapi(createCategoryRoute, (c) => {
      const body = c.req.valid("json");
      return c.json(createCategory(db, { ...body, source: "ui" }), 200);
    })
    .openapi(updateCategoryRoute, (c) => {
      const body = c.req.valid("json");
      const { id } = c.req.valid("param");
      return c.json(updateCategory(db, id, { ...body, source: "ui" }), 200);
    })
    .openapi(archiveCategoryRoute, (c) => {
      const { id } = c.req.valid("param");
      return c.json(archiveCategory(db, id, { source: "ui" }), 200);
    })
    .openapi(restoreCategoryRoute, (c) => {
      const { id } = c.req.valid("param");
      return c.json(restoreCategory(db, id, { source: "ui" }), 200);
    });
}

export type CategoryRoutes = ReturnType<typeof categoryRoutes>;
