export type StatementRow = {
  date: string;
  description: string;
  amount: number;
  bankId: string | null;
};

export type ParsedStatement = {
  rows: StatementRow[];
  closingBalance: number | null;
  closingDate: string | null;
};
