import { z } from "zod";
import { isoDateSchema } from "./date";
import { columnMapSchema } from "./statement";
import { listQuerySchema, pagedResponseSchema } from "./list";
import { interestRateMilliPctSchema } from "./rate";
import { isUtcTimestamp } from "./time";
import { centsSchema } from "./money";

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

const interestKinds = new Set<AccountKind>(["savings", "loan"]);

export function accountClass(kind: AccountKind): AccountClass {
  return liabilityKinds.has(kind) ? "liability" : "asset";
}

/** The form shows a liability as a positive amount owed. The book stores it as a negative balance. */
export function balanceFromEntry(kind: AccountKind, entered: number): number {
  return accountClass(kind) === "liability" && entered !== 0 ? -entered : entered;
}

export function entryFromBalance(kind: AccountKind, balance: number): number {
  return balanceFromEntry(kind, balance);
}

/** Assets add to "have". A liability in debt adds to "owe". A liability in credit adds to "have". */
export function netWorthOf(accounts: readonly { kind: AccountKind; balance: number }[]): {
  have: number;
  owe: number;
  net: number;
} {
  let have = 0;
  let owe = 0;
  for (const account of accounts) {
    if (accountClass(account.kind) === "liability" && account.balance < 0) {
      owe += -account.balance;
    } else {
      have += account.balance;
    }
  }
  return { have, owe, net: have - owe };
}

export function defaultOnBudget(kind: AccountKind): boolean {
  return budgetKinds.has(kind);
}

export function allowsInterestRate(kind: AccountKind): boolean {
  return interestKinds.has(kind);
}


const nonNegativeCentsSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

const accountFields = {
  name: z.string().trim().min(1),
  institution: z.string().trim().min(1).nullable().optional(),
  kind: z.enum(accountKinds),
  openingDate: isoDateSchema.nullable().optional(),
  openingBalance: centsSchema
    .optional()
    .meta({ money: true, description: "Signed. A liability that is owed has a negative opening balance." }),
  paymentPolicy: z.enum(paymentPolicies).nullable().optional(),
  fixedPayment: nonNegativeCentsSchema.nullable().optional(),
  interestRateMilliPct: interestRateMilliPctSchema.nullable().optional(),
};

function cardAndRateOk(
  value: {
    kind: AccountKind;
    paymentPolicy?: PaymentPolicy | null;
    fixedPayment?: number | null;
    interestRateMilliPct?: number | null;
  },
  context: z.RefinementCtx,
): void {
  const policy = value.paymentPolicy ?? null;
  const fixed = value.fixedPayment ?? null;
  if (value.kind === "credit_card") {
    if (policy === null) {
      context.addIssue({ code: "custom", path: ["paymentPolicy"] });
    } else if (policy === "fixed" && fixed === null) {
      context.addIssue({ code: "custom", path: ["fixedPayment"] });
    } else if (policy !== "fixed" && fixed !== null) {
      context.addIssue({ code: "custom", path: ["fixedPayment"] });
    }
  } else if (policy !== null || fixed !== null) {
    context.addIssue({ code: "custom", path: ["paymentPolicy"] });
  }
  if ((value.interestRateMilliPct ?? null) !== null && !allowsInterestRate(value.kind)) {
    context.addIssue({ code: "custom", path: ["interestRateMilliPct"] });
  }
}

export const accountCreateSchema = z
  .object({
    ...accountFields,
    onBudget: z.boolean().optional(),
  })
  .superRefine(cardAndRateOk);

export const accountUpdateSchema = z
  .object({
    ...accountFields,
    onBudget: z.boolean(),
  })
  .superRefine(cardAndRateOk);

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
  openingAutomatic: z.boolean(),
  automaticOpeningDate: isoDateSchema,
  automaticFollowsTransactions: z.boolean(),
  openingBalance: centsSchema,
  archivedAt: z.string().refine(isUtcTimestamp).nullable(),
  paymentPolicy: z.enum(paymentPolicies).nullable(),
  fixedPayment: nonNegativeCentsSchema.nullable(),
  interestRateMilliPct: interestRateMilliPctSchema.nullable(),
  importPreset: z.string().nullable(),
  columnMap: columnMapSchema.nullable(),
  balance: centsSchema,
});

export const accountListQuerySchema = listQuerySchema(["name", "kind"]).extend({
  archived: z
    .union([z.boolean(), z.enum(["true", "false"])])
    .optional()
    .transform((value) => value === true || value === "true"),
});

export const accountListSchema = pagedResponseSchema(accountSchema);

export type Account = z.infer<typeof accountSchema>;
export type AccountCreate = z.infer<typeof accountCreateSchema>;
export type AccountUpdate = z.infer<typeof accountUpdateSchema>;
export type AccountListQuery = z.output<typeof accountListQuerySchema>;
