import { z } from "zod";
import { Temporal } from "temporal-polyfill";
import { isoDateSchema } from "./date";
import { medianMinor } from "./recurring-calc";

export const defaultCardDueDays = 21;

export const cardStatementCodes = ["statement", "estimated"] as const;

export const cardStatementSchema = z.object({
  code: z.enum(cardStatementCodes),
  date: isoDateSchema,
  dueDate: isoDateSchema,
});

export const cardStatementListSchema = z.object({
  items: z.array(cardStatementSchema),
});

export type CardStatement = z.infer<typeof cardStatementSchema>;

function daysBetween(from: string, to: string): number {
  return Temporal.PlainDate.from(from).until(Temporal.PlainDate.from(to), { largestUnit: "day" }).days;
}

function dueGap(statements: readonly { date: string }[], paymentDates: readonly string[]): number {
  const payments = [...paymentDates].sort();
  const gaps: number[] = [];
  for (const statement of statements) {
    const next = payments.find((date) => date > statement.date);
    if (next) {
      gaps.push(daysBetween(statement.date, next));
    }
  }
  if (gaps.length < 2) {
    return defaultCardDueDays;
  }
  return medianMinor(gaps);
}

function dueDate(statementDate: string, gapDays: number): string {
  return Temporal.PlainDate.from(statementDate).add({ days: gapDays }).toString();
}

export function cardStatements(input: {
  statements: readonly { date: string }[];
  paymentDates: readonly string[];
}): CardStatement[] {
  const statements = [...input.statements].sort((left, right) => (left.date < right.date ? -1 : left.date > right.date ? 1 : 0));
  if (statements.length === 0) {
    return [];
  }
  const gap = dueGap(statements, input.paymentDates);
  const items: CardStatement[] = statements.map((statement) => ({
    code: "statement",
    date: statement.date,
    dueDate: dueDate(statement.date, gap),
  }));
  const last = statements[statements.length - 1];
  if (!last) {
    return items;
  }
  const next = Temporal.PlainDate.from(last.date).add({ months: 1 }).toString();
  items.push({ code: "estimated", date: next, dueDate: dueDate(next, gap) });
  return items;
}
