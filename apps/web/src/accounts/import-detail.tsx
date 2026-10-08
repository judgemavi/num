import { currencyUpdateSchema, importDetailSchema, importUndoSchema, type ImportDetailRow } from "@num/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getRouteApi, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  formatImportDate,
  formatImportPeriod,
  formatStatementDate,
  importCountText,
  importError,
  importOutcomeLabel,
  importStatusLabel,
  undoBlockLabel,
  unreadableLabel,
} from "@/accounts/import-format";
import { apiRequest } from "@/request";
import { Amount } from "@/components/amount";
import { ListCard, ListRow, listName } from "@/components/list-card";
import { PageHeader } from "@/components/page-header";
import { RowMenu } from "@/components/row-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { useEditors } from "@/editors/editor-api";
import { useBookCurrency } from "@/editors/lookups";

const detailRoute = getRouteApi("/accounts_/imports_/$importId");

export function ImportDetailScreen() {
  const { importId } = detailRoute.useParams();
  const queryClient = useQueryClient();
  const { openEditor, confirm } = useEditors();
  const currency = useBookCurrency();
  const [error, setError] = useState<string | null>(null);

  const detail = useQuery({
    queryKey: ["import-detail", importId],
    queryFn: async () => {
      const result = await apiRequest(`/api/imports/${importId}`, importDetailSchema);
      if (!result.ok) {
        throw new Error(result.code);
      }
      return result.data;
    },
  });

  useEffect(() => {
    const id = window.location.hash.replace("#", "");
    if (!id || !detail.data) {
      return;
    }
    document.getElementById(id)?.scrollIntoView({ block: "center" });
  }, [detail.data]);

  async function undoImport(filename: string) {
    const ok = await confirm({
      title: "Undo this import?",
      description: `Remove the transactions from ${filename} that are still unchanged. Matched rows lose their link.`,
      confirmLabel: "Undo import",
    });
    if (!ok) {
      return;
    }
    const result = await apiRequest(`/api/imports/${importId}/undo`, importUndoSchema, { method: "POST" });
    if (!result.ok) {
      setError(importError(result.code));
      return;
    }
    setError(null);
    await queryClient.invalidateQueries({ queryKey: ["import-detail", importId] });
    await queryClient.invalidateQueries({ queryKey: ["import-view"] });
    await queryClient.invalidateQueries({ queryKey: ["imports"] });
    await queryClient.invalidateQueries({ queryKey: ["transactions"] });
    if (result.data.blocked.length > 0) {
      await confirm({
        title: "Some rows stayed",
        description: (
          <div className="grid gap-3">
            <p>These rows were edited or reconciled, so this undo left them in place.</p>
            <ul className="grid max-h-64 gap-3 overflow-y-auto">
              {result.data.blocked.map((row) => (
                <li key={row.rowIndex} className="grid gap-1 border-t pt-3 text-sm">
                  <p className="font-semibold text-foreground">
                    {formatStatementDate(row.date)} · {row.payeeRaw || "No description"}
                  </p>
                  <p>
                    {currency.data ? <Amount currency={currency.data} minor={row.amount} /> : null} · {undoBlockLabel(row.reason)}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        ),
        confirmLabel: "Close",
        hideCancel: true,
      });
    }
  }

  if (detail.isPending) {
    return <p className="text-muted-foreground">Loading the import.</p>;
  }
  if (detail.isError || !detail.data) {
    return (
      <div className="grid gap-3">
        <p>{importError(detail.error instanceof Error ? detail.error.message : "import_not_found")}</p>
        <Button type="button" variant="secondary" asChild>
          <Link to="/accounts/imports" search={{ page: 1, pageSize: 50 }}>
            Back to imports
          </Link>
        </Button>
      </div>
    );
  }

  const item = detail.data.item;
  const filename = item.filename ?? "Statement";

  return (
    <>
      <PageHeader
        kicker={`${item.accountName} · ${formatImportDate(item.createdAt)}`}
        title={filename}
        actions={
          <>
            {item.documentId ? (
              <Button type="button" variant="secondary" asChild>
                <a href={`/api/documents/${item.documentId}`}>Download file</a>
              </Button>
            ) : null}
            {item.status === "undone" ? null : (
              <RowMenu label={`Actions for ${filename}`}>
                <DropdownMenuItem className="min-h-11" onSelect={() => void undoImport(filename)}>
                  Undo
                </DropdownMenuItem>
              </RowMenu>
            )}
          </>
        }
      />
      <p className="text-sm text-muted-foreground">
        <Link to="/accounts/imports" search={{ page: 1, pageSize: 50 }} className="font-semibold text-primary">
          Imports
        </Link>
        {" · "}
        {formatImportPeriod(item.periodStart, item.periodEnd)}
        {" · "}
        {importStatusLabel(item.status)}
        {" · "}
        {importCountText(item.counts)}
      </p>
      {error ? (
        <p role="alert" className="text-sm text-attn">
          {error}
        </p>
      ) : null}
      <ListCard label="Rows in this file" title="Rows">
        {detail.data.rows.length === 0 && detail.data.unreadable.length === 0 ? (
          <p className="px-5 py-4 text-muted-foreground">This file has no rows.</p>
        ) : null}
        {detail.data.rows.map((row) => (
          <DetailRow key={row.id} row={row} onOpenTransaction={(id) => void openEditor("transaction", { id })} />
        ))}
        {detail.data.unreadable.map((row) => (
          <ListRow key={`line-${row.line}`}>
            <div className={listName}>
              <p>Line {row.line}</p>
              <small>{unreadableLabel(row.reason)}</small>
              <small className="break-all">{row.raw}</small>
            </div>
            <Badge variant="attention">Unreadable</Badge>
          </ListRow>
        ))}
      </ListCard>
    </>
  );
}

function DetailRow({ row, onOpenTransaction }: { row: ImportDetailRow; onOpenTransaction: (id: string) => void }) {
  return (
    <ListRow>
      <div id={`import-row-${row.id}`} className={listName}>
        <p>{row.payeeRaw || "No description"}</p>
        <small>
          {formatStatementDate(row.date)} · {importOutcomeLabel(row.outcome)}
        </small>
        <RowLinks row={row} onOpenTransaction={onOpenTransaction} />
      </div>
      <RowAmount row={row} />
    </ListRow>
  );
}

function RowLinks({ row, onOpenTransaction }: { row: ImportDetailRow; onOpenTransaction: (id: string) => void }) {
  if (row.transactionId) {
    return (
      <button type="button" className="min-h-11 text-left font-semibold text-primary" onClick={() => onOpenTransaction(row.transactionId!)}>
        Open transaction
      </button>
    );
  }
  if (row.duplicateBatchId && row.duplicateRowId) {
    return (
      <Link
        to="/accounts/imports/$importId"
        params={{ importId: row.duplicateBatchId }}
        hash={`import-row-${row.duplicateRowId}`}
        className="inline-flex min-h-11 items-center font-semibold text-primary"
      >
        Earlier row
      </Link>
    );
  }
  return null;
}

function RowAmount({ row }: { row: ImportDetailRow }) {
  const currency = useQuery({
    queryKey: ["book-currency"],
    queryFn: async () => {
      const result = await apiRequest("/api/settings/currency", currencyUpdateSchema);
      if (!result.ok) {
        throw new Error(result.code);
      }
      return result.data.currency;
    },
  });
  if (!currency.data) {
    return null;
  }
  return <Amount currency={currency.data} minor={row.amount} />;
}
