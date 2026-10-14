import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { validationHook } from "../validation";

const healthSchema = z.object({
  ok: z.literal(true),
});

const healthRoute = createRoute({
  operationId: "get_health",
  description: "Check that the API is running. This does not read or change the books. Amounts are integer milliunits: 1000 is one unit of the book currency. Money that enters the account is positive.",
  method: "get",
  path: "/api/health",
  responses: {
    200: {
      description: "Health",
      content: {
        "application/json": {
          schema: healthSchema,
        },
      },
    },
  },
});

export function healthRoutes() {
  return new OpenAPIHono({ defaultHook: validationHook }).openapi(healthRoute, (c) => c.json({ ok: true as const }, 200));
}

export type HealthRoutes = ReturnType<typeof healthRoutes>;
