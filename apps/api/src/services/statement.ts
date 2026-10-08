export const unreadableReasons = [
  "date_unreadable",
  "amount_unreadable",
  "too_many_decimals",
  "amount_too_large",
] as const;

export type UnreadableReason = (typeof unreadableReasons)[number];

export type StatementRow = {
  date: string;
  description: string;
  amount: number;
  bankId: string | null;
};

export type UnreadableRow = {
  line: number;
  raw: string;
  reason: UnreadableReason;
};

export type ParsedStatement = {
  rows: StatementRow[];
  unreadable: UnreadableRow[];
  closingBalance: number | null;
  closingDate: string | null;
};
