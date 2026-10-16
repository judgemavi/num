import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { valuationInputSchema, valuationListSchema, valuationSchema, valuationUpdateSchema } from "@num/shared";
import type { Db } from "../db";
import { createValuation, deleteValuation, listValuations, updateValuation } from "../services/valuations";
import { validationHook } from "../validation";
import { errorResponse, idParams } from "./common";

const valuationParams = idParams.extend({ valuationId: z.uuid() });
const result = {
  200: { description: "The valuation", content: { "application/json": { schema: valuationSchema } } },
  400: errorResponse,
  404: errorResponse,
  409: errorResponse,
};
const listRoute = createRoute({
  operationId: "get_accounts_id_valuations",
  description: "Read the valuations of an account, newest first. This does not change a record.",
  method: "get", path: "/api/accounts/{id}/valuations",
  request: { params: idParams },
  responses: {
    200: { description: "The valuations", content: { "application/json": { schema: valuationListSchema } } },
    400: errorResponse, 404: errorResponse,
  },
});
const createRouteDef = createRoute({
  operationId: "post_accounts_id_valuations",
  description: "Add a valuation for an investment, property, mortgage or loan account. Use the stored signed balance. An amount owed is negative. Only one valuation is allowed on each date.",
  method: "post", path: "/api/accounts/{id}/valuations",
  request: { params: idParams, body: { required: true, content: { "application/json": { schema: valuationInputSchema } } } },
  responses: result,
});
const updateRoute = createRoute({
  operationId: "patch_accounts_id_valuations_valuationid",
  description: "Change only the supplied fields of a valuation. Use the stored signed balance. An amount owed is negative.",
  method: "patch", path: "/api/accounts/{id}/valuations/{valuationId}",
  request: { params: valuationParams, body: { required: true, content: { "application/json": { schema: valuationUpdateSchema } } } },
  responses: result,
});
const deleteRoute = createRoute({
  operationId: "delete_accounts_id_valuations_valuationid",
  description: "Delete a valuation. The account balance is calculated again from the remaining valuations and transactions.",
  method: "delete", path: "/api/accounts/{id}/valuations/{valuationId}",
  request: { params: valuationParams },
  responses: {
    200: result[200],
    400: errorResponse,
    404: errorResponse,
  },
});

export function valuationRoutes(db: Db) {
  return new OpenAPIHono({ defaultHook: validationHook })
    .openapi(listRoute, (c) => c.json(listValuations(db, c.req.valid("param").id), 200))
    .openapi(createRouteDef, (c) => c.json(createValuation(db, c.req.valid("param").id, { ...c.req.valid("json"), source: "ui" }), 200))
    .openapi(updateRoute, (c) => {
      const { id, valuationId } = c.req.valid("param");
      return c.json(updateValuation(db, id, valuationId, { ...c.req.valid("json"), source: "ui" }), 200);
    })
    .openapi(deleteRoute, (c) => {
      const { id, valuationId } = c.req.valid("param");
      return c.json(deleteValuation(db, id, valuationId, { source: "ui" }), 200);
    });
}
