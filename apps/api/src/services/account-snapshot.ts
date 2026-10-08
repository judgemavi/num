import { columnMapSchema, type ColumnMap } from "@num/shared";

export function readColumnMap(value: string | null): ColumnMap | null {
  if (!value) {
    return null;
  }
  try {
    const parsed = columnMapSchema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function accountAuditSnapshot(row: {
  name: string;
  institution: string | null;
  kind: string;
  onBudget: boolean;
  openingDate: string;
  openingBalance: number;
  archivedAt: string | null;
  creditLimit: number | null;
  statementDay: number | null;
  dueDay: number | null;
  paymentPolicy: string | null;
  fixedPayment: number | null;
  interestRateMilliPct: number | null;
  importPreset: string | null;
  columnMap: string | null;
}) {
  return {
    name: row.name,
    institution: row.institution,
    kind: row.kind,
    onBudget: row.onBudget,
    openingDate: row.openingDate,
    openingBalance: row.openingBalance,
    archivedAt: row.archivedAt,
    creditLimit: row.creditLimit,
    statementDay: row.statementDay,
    dueDay: row.dueDay,
    paymentPolicy: row.paymentPolicy,
    fixedPayment: row.fixedPayment,
    interestRateMilliPct: row.interestRateMilliPct,
    importPreset: row.importPreset,
    columnMap: row.columnMap,
  };
}
