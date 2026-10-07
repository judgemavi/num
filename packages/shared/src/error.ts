import { z } from "zod";

export const errorCodes = [
  "as_of_required",
  "as_of_invalid",
  "sort_unknown",
  "invalid_query",
  "invalid_body",
  "invalid_params",
  "setup_already_complete",
  "setup_required",
  "currency_locked",
] as const;

export type ErrorCode = (typeof errorCodes)[number];

export const errorSchema = z.object({
  code: z.enum(errorCodes),
  params: z.record(z.string(), z.string()),
});

export type ErrorBody = z.infer<typeof errorSchema>;
