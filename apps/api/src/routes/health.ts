import { createRoute, z } from "@hono/zod-openapi";

const healthSchema = z.object({
  ok: z.literal(true),
});

export const healthRoute = createRoute({
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
