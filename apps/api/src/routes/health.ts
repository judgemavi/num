import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { validationHook } from "../validation";

const healthSchema = z.object({
  ok: z.literal(true),
});

const healthRoute = createRoute({
  operationId: "get_health",
  description: "Check that the API is running. This does not read or change the books.",
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
