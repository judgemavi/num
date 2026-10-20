import type { ParsedStatement } from "@num/shared";
import { formatStatementDate } from "@/accounts/import-format";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useBookCurrency } from "@/editors/lookups";
import { formatMoney } from "@/money";

const shownRows = 3;

/** The first rows of a file as they will go into the ledger. */
export function ImportSample({ statement }: { statement: ParsedStatement }) {
  const currency = useBookCurrency();
  return (
    <div className="min-w-0 overflow-hidden rounded-xl border">
      <Table className="min-w-[24rem]">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Date</TableHead>
            <TableHead>Description</TableHead>
            <TableHead className="text-right">Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {statement.rows.slice(0, shownRows).map((row, index) => (
            <TableRow key={index} className="hover:bg-transparent">
              <TableCell className="whitespace-nowrap">{formatStatementDate(row.date)}</TableCell>
              <TableCell className="max-w-64 truncate">{row.description || "No description"}</TableCell>
              <TableCell className="text-right whitespace-nowrap tabular-nums">{formatMoney(currency, row.amount)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
