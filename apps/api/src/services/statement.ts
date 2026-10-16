import type { UnreadableRow } from "@num/shared";

export type StatementRow = {
  date: string;
  description: string;
  amount: number;
  bankId: string | null;
};

type StatementOpeningRow = {
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
