import { z } from "zod";
import { isoDateSchema } from "./date";
import { listQuerySchema, pagedResponseSchema } from "./list";
import { isUtcTimestamp } from "./time";

export const accountKinds = [
  "chequing",
  "savings",
  "cash",
  "credit_card",
  "mortgage",
  "loan",
  "investment",
  "property",
  "receivable",
  "other_asset",
  "other_liability",
] as const;

export type AccountKind = (typeof accountKinds)[number];

export const accountClasses = ["asset", "liability"] as const;

export type AccountClass = (typeof accountClasses)[number];

export const paymentPolicies = ["full", "fixed", "manual"] as const;

export type PaymentPolicy = (typeof paymentPolicies)[number];

const liabilityKinds = new Set<AccountKind>(["credit_card", "mortgage", "loan", "other_liability"]);

const budgetKinds = new Set<AccountKind>(["chequing", "savings", "cash", "credit_card"]);

const interestKinds = new Set<AccountKind>(["savings", "credit_card", "loan"]);

export function accountClass(kind: AccountKind): AccountClass {
  return liabilityKinds.has(kind) ? "liability" : "asset";
}

export function defaultOnBudget(kind: AccountKind): boolean {
  return budgetKinds.has(kind);
}

export function allowsInterestRate(kind: AccountKind): boolean {
  return interestKinds.has(kind);
}

const centsSchema = z.number().int().min(Number.MIN_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER);

const nonNegativeCentsSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

const daySchema = z.number().int().min(1).max(31);

const accountFields = {
  name: z.string().trim().min(1),
  institution: z.string().trim().min(1).nullable().optional(),
  kind: z.enum(accountKinds),
  openingDate: isoDateSchema,
  openingBalance: centsSchema,
  creditLimit: nonNegativeCentsSchema.nullable().optional(),
  statementDay: daySchema.nullable().optional(),
  dueDay: daySchema.nullable().optional(),
  paymentPolicy: z.enum(paymentPolicies).nullable().optional(),
  fixedPayment: nonNegativeCentsSchema.nullable().optional(),
  interestRateBps: nonNegativeCentsSchema.nullable().optional(),
};

export const accountCreateSchema = z.object({
  ...accountFields,
  onBudget: z.boolean().optional(),
});

export const accountUpdateSchema = z.object({
  ...accountFields,
  onBudget: z.boolean(),
});

export const archiveAccountSchema = z.object({
  confirm: z.boolean().default(false),
});

export const accountSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  institution: z.string().nullable(),
  kind: z.enum(accountKinds),
  onBudget: z.boolean(),
  openingDate: isoDateSchema,
  openingBalance: centsSchema,
  archivedAt: z.string().refine(isUtcTimestamp).nullable(),
  creditLimit: nonNegativeCentsSchema.nullable(),
  statementDay: daySchema.nullable(),
  dueDay: daySchema.nullable(),
  paymentPolicy: z.enum(paymentPolicies).nullable(),
  fixedPayment: nonNegativeCentsSchema.nullable(),
  interestRateBps: nonNegativeCentsSchema.nullable(),
  balance: centsSchema,
});

export const accountListQuerySchema = listQuerySchema(["name", "kind"]);

export const accountListSchema = pagedResponseSchema(accountSchema);

export type Account = z.infer<typeof accountSchema>;
export type AccountCreate = z.infer<typeof accountCreateSchema>;
export type AccountUpdate = z.infer<typeof accountUpdateSchema>;
