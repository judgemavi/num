import { createRoute, z } from "@hono/zod-openapi";

const healthSchema = z.object({
  ok: z.literal(true),
});

export const healthRoute = createRoute({
  operationId: "get_health",
  description: "Check that the API is running. This does not read or change the books. Amounts are integer minor units. Money that enters the account is positive.",
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
