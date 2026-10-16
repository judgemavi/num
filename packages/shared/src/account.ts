import { z } from "zod";
import { isoDateSchema } from "./date";
import { columnMapSchema } from "./statement";
import { archivedQuery, listQuerySchema, pagedResponseSchema, queryNumber, transactionSortColumns } from "./list";
import { interestRateMilliPctSchema } from "./rate";
import { isUtcTimestamp } from "./time";
import { amountSchema, nonNegativeAmountSchema } from "./money";
import { mortgageTermsWriteSchema } from "./mortgage";

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

const accountClasses = ["asset", "liability"] as const;

type AccountClass = (typeof accountClasses)[number];

export const paymentPolicies = ["full", "fixed", "manual"] as const;

export type PaymentPolicy = (typeof paymentPolicies)[number];

const liabilityKinds = new Set<AccountKind>(["credit_card", "mortgage", "loan", "other_liability"]);

const budgetKinds = new Set<AccountKind>(["chequing", "savings", "cash", "credit_card"]);

const interestKinds = new Set<AccountKind>(["savings", "loan"]);

/** These accounts use a valuation before subsequent transactions. */
export function usesValuation(kind: AccountKind): boolean {
  return kind === "investment" || kind === "property" || kind === "mortgage" || kind === "loan";
}

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

const accountFields = {
  name: z.string().trim().min(1),
  institution: z.string().trim().min(1).nullable().optional(),
  kind: z.enum(accountKinds),
  openingDate: isoDateSchema.nullable().optional(),
  openingBalance: amountSchema
    .optional()
    .meta({ money: true, description: "Signed. A liability that is owed has a negative opening balance." }),
  paymentPolicy: z.enum(paymentPolicies).nullable().optional(),
  fixedPayment: nonNegativeAmountSchema.nullable().optional(),
  interestRateMilliPct: interestRateMilliPctSchema.nullable().optional(),
  mortgageTerms: mortgageTermsWriteSchema
    .nullable()
    .optional()
    .meta({
      description:
        "Only for a mortgage. An object sets the terms. null removes them. Leave it out to keep the terms. The terms need an opening date.",
    }),
};

/** The card field that is not correct for the account kind. null when the card fields are correct. */
export function cardFieldIssue(value: {
  kind: AccountKind;
  paymentPolicy?: PaymentPolicy | null;
  fixedPayment?: number | null;
}): "paymentPolicy" | "fixedPayment" | null {
  const policy = value.paymentPolicy ?? null;
  const fixed = value.fixedPayment ?? null;
  if (value.kind !== "credit_card") {
    return policy !== null || fixed !== null ? "paymentPolicy" : null;
  }
  if (policy === null) {
    return "paymentPolicy";
  }
  return (policy === "fixed") === (fixed === null) ? "fixedPayment" : null;
}

function cardAndRateOk(
  value: {
    kind: AccountKind;
    paymentPolicy?: PaymentPolicy | null;
    fixedPayment?: number | null;
    interestRateMilliPct?: number | null;
    openingDate?: string | null;
    mortgageTerms?: unknown;
  },
  context: z.RefinementCtx,
): void {
  const cardField = cardFieldIssue(value);
  if (cardField) {
    context.addIssue({ code: "custom", path: [cardField] });
  }
  if ((value.mortgageTerms ?? null) !== null) {
    if (value.kind !== "mortgage") {
      context.addIssue({ code: "custom", path: ["mortgageTerms"] });
    } else if (!value.openingDate) {
      context.addIssue({ code: "custom", path: ["openingDate"] });
    }
  }
  if ((value.interestRateMilliPct ?? null) !== null && !allowsInterestRate(value.kind)) {
    context.addIssue({ code: "custom", path: ["interestRateMilliPct"] });
  }
}

const accountWriteFields = z.object({
  ...accountFields,
  onBudget: z.boolean().optional(),
});

export const accountCreateSchema = accountWriteFields.superRefine(cardAndRateOk);

/** A PATCH body: only the fields that change. The API checks the fields together on the stored account with the patch. */
export const accountUpdateSchema = accountWriteFields.partial();

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
  openingBalance: amountSchema,
  archivedAt: z.string().refine(isUtcTimestamp).nullable(),
  paymentPolicy: z.enum(paymentPolicies).nullable(),
  fixedPayment: nonNegativeAmountSchema.nullable(),
  interestRateMilliPct: interestRateMilliPctSchema.nullable(),
  importPreset: z.string().nullable(),
  columnMap: columnMapSchema.nullable(),
  balance: amountSchema,
  hasValuation: z.boolean(),
});

export const accountListQuerySchema = listQuerySchema(["name", "kind"]).extend({
  ...archivedQuery,
});

export const accountListApiQuerySchema = accountListQuerySchema.extend({ asOf: isoDateSchema });

export const accountActivityQuerySchema = z.object({
  page: queryNumber().min(1).default(1),
  sort: z.enum(transactionSortColumns).optional(),
  dir: z.enum(["asc", "desc"]).optional(),
});

export const accountListSchema = pagedResponseSchema(accountSchema);

export type Account = z.infer<typeof accountSchema>;
export type AccountCreate = z.infer<typeof accountCreateSchema>;
export type AccountUpdate = z.infer<typeof accountUpdateSchema>;
export type AccountListQuery = z.output<typeof accountListQuerySchema>;
