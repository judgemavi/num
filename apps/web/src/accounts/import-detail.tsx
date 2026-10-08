import {
  accountListSchema,
  categoryListSchema,
  currencyUpdateSchema,
  importDetailSchema,
  importUndoSchema,
  merchantListSchema,
  tagListSchema,
  transactionSchema,
  type Account,
  type Category,
  type ImportDetailRow,
  type ImportUndo,
  type Merchant,
  type Tag,
  type Transaction,
} from "@num/shared";
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
import { loadAllPages } from "@/settings/load-all-pages";
import { Amount } from "@/components/amount";
import { ListCard, ListRow, listName } from "@/components/list-card";
import { PageHeader } from "@/components/page-header";
import { RowMenu } from "@/components/row-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { TransactionDialog } from "@/transactions/transaction-dialog";

const detailRoute = getRouteApi("/accounts_/imports_/$importId");

type Page<T> = { items: T[]; page: number; pageSize: number; total: number };

async function loadNamed<T extends { id: string }>(base: string, schema: { parse: (data: unknown) => Page<T> }) {
  const active = await loadAllPages(base, schema, { archived: false });
  const archived = await loadAllPages(base, schema, { archived: true });
  return [...active.items, ...archived.items];
}

export function ImportDetailScreen() {
  const { importId } = detailRoute.useParams();
  const queryClient = useQueryClient();
  const [confirmUndo, setConfirmUndo] = useState(false);
  const [blocked, setBlocked] = useState<ImportUndo["blocked"]>([]);
  const [error, setError] = useState<string | null>(null);
  const [transactionId, setTransactionId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Transaction | null>(null);

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

  async function confirm() {
    setConfirmUndo(false);
    const result = await apiRequest(`/api/imports/${importId}/undo`, importUndoSchema, { method: "POST" });
    if (!result.ok) {
      setError(importError(result.code));
      return;
    }
    setError(null);
    setBlocked(result.data.blocked);
    await queryClient.invalidateQueries({ queryKey: ["import-detail", importId] });
    await queryClient.invalidateQueries({ queryKey: ["import-view"] });
    await queryClient.invalidateQueries({ queryKey: ["imports"] });
    await queryClient.invalidateQueries({ queryKey: ["transactions"] });
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
                <DropdownMenuItem className="min-h-11" onSelect={() => setConfirmUndo(true)}>
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
          <DetailRow key={row.id} row={row} onOpenTransaction={setTransactionId} />
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
      <AlertDialog open={confirmUndo} onOpenChange={setConfirmUndo}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Undo this import?</AlertDialogTitle>
            <AlertDialogDescription>
              Remove the transactions from {filename} that are still unchanged. Matched rows lose their link.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirm()}>Undo import</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={blocked.length > 0} onOpenChange={(open) => !open && setBlocked([])}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Some rows stayed</AlertDialogTitle>
            <AlertDialogDescription>These rows were edited or reconciled, so this undo left them in place.</AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="grid max-h-64 gap-3 overflow-y-auto">
            {blocked.map((row) => (
              <li key={row.rowIndex} className="grid gap-1 border-t pt-3 text-sm">
                <p className="font-semibold">
                  {formatStatementDate(row.date)} · {row.payeeRaw || "No description"}
                </p>
                <p className="text-muted-foreground">
                  <BlockedAmount row={row} /> · {undoBlockLabel(row.reason)}
                </p>
              </li>
            ))}
          </ul>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setBlocked([])}>Close</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {transactionId ? (
        <ImportTransaction
          id={transactionId}
          onClose={() => setTransactionId(null)}
          onDelete={setDeleteTarget}
        />
      ) : null}
      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this transaction?</AlertDialogTitle>
            <AlertDialogDescription>The transaction leaves the list.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!deleteTarget) {
                  return;
                }
                void apiRequest(`/api/transactions/${deleteTarget.id}`, transactionSchema, { method: "DELETE" }).then(() => {
                  setDeleteTarget(null);
                  setTransactionId(null);
                  void queryClient.invalidateQueries({ queryKey: ["transactions"] });
                });
              }}
            >
              Delete transaction
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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

function BlockedAmount({ row }: { row: { amount: number } }) {
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

function ImportTransaction({
  id,
  onClose,
  onDelete,
}: {
  id: string;
  onClose: () => void;
  onDelete: (transaction: Transaction) => void;
}) {
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
  const accounts = useQuery({
    queryKey: ["accounts", "options"],
    queryFn: () => loadNamed<Account>("/api/accounts", accountListSchema),
  });
  const categories = useQuery({
    queryKey: ["categories", "options"],
    queryFn: () => loadNamed<Category>("/api/categories", categoryListSchema),
  });
  const tags = useQuery({
    queryKey: ["tags", "options"],
    queryFn: () => loadNamed<Tag>("/api/tags", tagListSchema),
  });
  const merchants = useQuery({
    queryKey: ["merchants", "options"],
    queryFn: async () => (await loadAllPages("/api/merchants", merchantListSchema, { archived: false })).items as Merchant[],
  });
  if (!currency.data || !accounts.data || !categories.data || !tags.data || !merchants.data) {
    return <p className="text-muted-foreground">Loading the transaction.</p>;
  }
  return (
    <TransactionDialog
      draft={id}
      currency={currency.data}
      accounts={accounts.data}
      categories={categories.data}
      tags={tags.data}
      merchants={merchants.data}
      onClose={onClose}
      onSaved={onClose}
      onDelete={onDelete}
    />
  );
}
