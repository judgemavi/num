import { z } from "zod";
import { isoDateSchema } from "./date";
import { listQuerySchema, pagedResponseSchema } from "./list";
import { isUtcTimestamp } from "./time";

export const ruleMatches = ["exact", "prefix", "contains"] as const;
export const ruleOrigins = ["manual", "promoted"] as const;

export type RuleMatch = (typeof ruleMatches)[number];
export type RuleOrigin = (typeof ruleOrigins)[number];

const archivedQuery = {
  archived: z
    .union([z.boolean(), z.enum(["true", "false"])])
    .optional()
    .transform((value) => value === true || value === "true"),
};

const prioritySchema = z.number().int().min(-1_000_000).max(1_000_000);

const ruleFields = {
  match: z.enum(ruleMatches),
  pattern: z.string().trim().min(1).max(200),
  accountId: z.uuid().nullable(),
  merchantId: z.uuid().nullable(),
  categoryId: z.uuid().nullable(),
  transferAccountId: z.uuid().nullable(),
  priority: prioritySchema,
};

export function ruleTargetsOk(value: {
  merchantId?: string | null;
  categoryId?: string | null;
  transferAccountId?: string | null;
}): boolean {
  const merchantId = value.merchantId ?? null;
  const categoryId = value.categoryId ?? null;
  const transferAccountId = value.transferAccountId ?? null;
  if (categoryId !== null && transferAccountId !== null) {
    return false;
  }
  return merchantId !== null || categoryId !== null || transferAccountId !== null;
}

export const ruleSchema = z.object({
  id: z.uuid(),
  ...ruleFields,
  origin: z.enum(ruleOrigins),
  archivedAt: z.string().refine(isUtcTimestamp).nullable(),
});

export const ruleCreateSchema = z
  .object({
    match: z.enum(ruleMatches),
    pattern: z.string().trim().min(1).max(200),
    accountId: z.uuid().nullable().optional(),
    merchantId: z.uuid().nullable().optional(),
    categoryId: z.uuid().nullable().optional(),
    transferAccountId: z.uuid().nullable().optional(),
    priority: prioritySchema,
  })
  .refine(ruleTargetsOk);

export const ruleUpdateSchema = z.object(ruleFields).refine(ruleTargetsOk);

export const ruleListQuerySchema = listQuerySchema(["priority", "pattern"]).extend(archivedQuery);
export const ruleListSchema = pagedResponseSchema(ruleSchema);

export const ruleApplySampleSchema = z.object({
  id: z.uuid(),
  date: isoDateSchema,
  payeeRaw: z.string(),
  amount: z.number().int(),
});

export const ruleApplyPreviewSchema = z.object({
  count: z.number().int(),
  sample: z.array(ruleApplySampleSchema),
});

export type Rule = z.infer<typeof ruleSchema>;
export type RuleCreate = z.infer<typeof ruleCreateSchema>;
export type RuleUpdate = z.infer<typeof ruleUpdateSchema>;
export type RuleListQuery = z.output<typeof ruleListQuerySchema>;
export type RuleApplyPreview = z.infer<typeof ruleApplyPreviewSchema>;

export type RulePattern = {
  id: string;
  match: RuleMatch;
  pattern: string;
  accountId: string | null;
  merchantId: string | null;
  categoryId: string | null;
  transferAccountId: string | null;
  priority: number;
  archivedAt: string | null;
};

export function validRulePattern(match: RuleMatch, pattern: string): boolean {
  if (match !== "exact" && match !== "prefix" && match !== "contains") {
    return false;
  }
  const text = pattern.trim();
  return text.length > 0 && text.length <= 200;
}

export function patternHits(match: RuleMatch, pattern: string, normalizedPayee: string): boolean {
  if (!validRulePattern(match, pattern) || normalizedPayee.length === 0) {
    return false;
  }
  const needle = pattern.trim().replace(/\s+/g, " ").toUpperCase();
  if (match === "exact") {
    return normalizedPayee === needle;
  }
  if (match === "prefix") {
    return normalizedPayee.startsWith(needle);
  }
  return normalizedPayee.includes(needle);
}

function byPriority(left: RulePattern, right: RulePattern): number {
  if (left.priority !== right.priority) {
    return right.priority - left.priority;
  }
  if (left.id < right.id) {
    return -1;
  }
  if (left.id > right.id) {
    return 1;
  }
  return 0;
}

export function chooseRule(rules: RulePattern[], normalizedPayee: string, accountId: string): RulePattern | null {
  const matched = rules.filter(
    (rule) =>
      rule.archivedAt === null &&
      (rule.accountId === null || rule.accountId === accountId) &&
      patternHits(rule.match, rule.pattern, normalizedPayee),
  );
  const scoped = matched.filter((rule) => rule.accountId === accountId).sort(byPriority);
  if (scoped[0]) {
    return scoped[0];
  }
  return matched.filter((rule) => rule.accountId === null).sort(byPriority)[0] ?? null;
}

