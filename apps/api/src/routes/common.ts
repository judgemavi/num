import { errorSchema } from "@num/shared";
import { z } from "@hono/zod-openapi";

export const errorResponse = {
  description: "The request is not valid",
  content: {
    "application/json": {
      schema: errorSchema,
    },
  },
} as const;

export const idParams = z.object({
  id: z.uuid(),
});
