import type { z } from "zod";
import { ServiceError } from "../service-error";
import { fieldParams } from "../validation";

/** The stored values with the fields of the patch. A field that the patch leaves out keeps its stored value. */
export function patched<T extends object>(stored: T, patch: Partial<T>): T {
  const changed = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined));
  return { ...stored, ...changed };
}

/**
 * A PATCH body has only the fields that change. The checks that use more than one field (for example a card payment
 * policy and its fixed payment) run on the stored record with the patch, through the full write schema.
 */
export function mergedWrite<S extends z.ZodType<object, object>>(schema: S, stored: z.input<S>, patch: Partial<z.input<S>>): z.output<S> {
  const result = schema.safeParse(patched(stored, patch));
  if (!result.success) {
    throw new ServiceError("invalid_body", 400, fieldParams(result.error));
  }
  return result.data;
}
