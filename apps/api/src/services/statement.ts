import type { UnreadableReason } from "@num/shared";

export type { UnreadableReason };

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

export type StatementOpeningRow = {
  date: string;
  amount: number;
  balance: number;
};

export type ParsedStatement = {
  rows: StatementRow[];
  unreadable: UnreadableRow[];
  closingBalance: number | null;
  closingDate: string | null;
  firstRow: StatementOpeningRow | null;
};
