import { settings } from "@num/db";
import { currencyStep, isWholeAmount } from "@num/shared";
import { eq } from "drizzle-orm";
import { ServiceError } from "../service-error";
import type { Reader } from "./write";

/** The milliunits in one minor unit of the book currency. A calculated amount is rounded to it (decision 0038). */
export function bookStep(db: Reader): number {
  const row = db.select().from(settings).where(eq(settings.key, "currency")).get();
  if (!row) {
    throw new ServiceError("setup_required", 409);
  }
  return currencyStep(row.value);
}

/** An amount that a person or an AI gives must be a whole number of minor units of the book currency. */
export function requireWholeAmounts(db: Reader, amounts: readonly (number | null | undefined)[]): void {
  const step = bookStep(db);
  if (amounts.some((amount) => amount != null && !isWholeAmount(amount, step))) {
    throw new ServiceError("amount_too_precise", 400);
  }
}
