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

export const paymentPolicies = ["full", "fixed", "manual"] as const;

export const compounding = ["monthly", "semiannual"] as const;

export const paymentFrequencies = ["weekly", "biweekly", "semimonthly", "monthly"] as const;

export const categoryKinds = ["income", "expense"] as const;

export const transactionStatuses = ["open", "cleared", "reconciled"] as const;

export const transactionSources = ["import", "manual", "mcp"] as const;

export const ruleMatches = ["exact", "prefix", "contains", "regex"] as const;

export const ruleOrigins = ["manual", "promoted"] as const;

export const planKinds = ["income", "bill", "transfer"] as const;

export const amountModes = ["fixed", "variable"] as const;

export const planFrequencies = ["weekly", "monthly", "yearly"] as const;

export const businessDayShifts = ["none", "next", "previous"] as const;

export const bucketKinds = ["spending", "sinking", "goal"] as const;

export const sinkingRepeats = ["none", "yearly"] as const;

export const bucketEventKinds = ["fund", "move", "release"] as const;

export const importOutcomes = ["created", "matched", "duplicate", "ignored"] as const;

export const proposalStatuses = ["pending", "approved", "rejected"] as const;

export const auditSources = ["ui", "import", "mcp"] as const;

export const settingKeys = [
  "currency",
  "bufferAmount",
  "emergencyFundMonths",
  "staleImportDays",
  "promoteAfter",
  "recurringGraceDays",
] as const;
