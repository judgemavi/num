import type { ImportDetailRow, ImportUndo } from "@num/shared";
import { useSuspenseQuery } from "@tanstack/react-query";
import { getRouteApi, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { errorCode } from "@/api/client";
import { documentPath } from "@/api/documents";
import { importDetailQuery, useResolveImportRow, useUndoImport } from "@/api/imports";
import { useDecideItem, useUndoDecision } from "@/api/review";
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
import { Amount } from "@/components/amount";
import { Boundary } from "@/components/boundary";
import { ListCard, ListRow, listName } from "@/components/list-card";
import { PageHeader } from "@/components/page-header";
import { RowMenu } from "@/components/row-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { useEditors } from "@/editors/editor-api";
import { useAccountLabels } from "@/editors/lookups";
import { localAsOf } from "@/as-of";
import { inboxError } from "@/review/format";

const detailRoute = getRouteApi("/accounts_/imports_/$importId");

/** The page of one import. A read that fails shows the reason and the way back to the list of imports. */
export function ImportDetailScreen() {
  return (
    <Boundary
      loading="Loading the import."
      failed={({ error }) => (
        <div className="grid gap-3">
          <p>{importError(errorCode(error))}</p>
          <Button type="button" variant="secondary" asChild>
            <Link to="/accounts/imports">
              Back to imports
            </Link>
          </Button>
        </div>
      )}
    >
      <ImportDetailPage />
    </Boundary>
  );
}

function ImportDetailPage() {
  const { importId } = detailRoute.useParams();
  const { openEditor, confirm } = useEditors();
  const accountLabels = useAccountLabels();
  const { data: detail } = useSuspenseQuery(importDetailQuery(importId));
  const undoImport = useUndoImport();
  const resolve = useResolveImportRow();
  const decide = useDecideItem();
  const undoDecision = useUndoDecision();
  const importFailure = undoImport.error ?? resolve.error;
  const reviewFailure = decide.error ?? undoDecision.error;
  const error = importFailure ? importError(errorCode(importFailure)) : reviewFailure ? inboxError(errorCode(reviewFailure)) : null;

  /** Remove the error of each request. A new action starts with no old message. */
  function clearErrors() {
    undoImport.reset();
    resolve.reset();
    decide.reset();
    undoDecision.reset();
  }

  useEffect(() => {
    const id = window.location.hash.replace("#", "");
    if (!id) {
      return;
    }
    document.getElementById(id)?.scrollIntoView({ block: "center" });
  }, [detail]);

  async function undo(filename: string) {
    const ok = await confirm({
      title: "Undo this import?",
      description: `Remove the transactions from ${filename} that are still unchanged. Matched rows lose their link.`,
      confirmLabel: "Undo import",
    });
    if (!ok) {
      return;
    }
    clearErrors();
    undoImport.mutate(importId, {
      onSuccess: (result) => {
        if (result.blocked.length > 0) {
          void showBlocked(result.blocked);
        }
      },
    });
  }

  function showBlocked(blocked: ImportUndo["blocked"]) {
    return confirm({
      title: "Some rows stayed",
      description: (
        <div className="grid gap-3">
          <p>These rows were edited or reconciled, so this undo left them in place.</p>
          <ul className="grid max-h-64 gap-3 overflow-y-auto">
            {blocked.map((row) => (
              <li key={row.rowIndex} className="grid gap-1 border-t pt-3 text-sm">
                <p className="font-semibold text-foreground">
                  {formatStatementDate(row.date)} · {row.payeeRaw || "No description"}
                </p>
                <p>
                  <Amount minor={row.amount} /> · {undoBlockLabel(row.reason)}
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

  const item = detail.item;
  const filename = item.filename ?? "Statement";

  return (
    <>
      <PageHeader
        kicker={`${accountLabels.get(item.accountId) ?? item.accountName} · ${formatImportDate(item.createdAt)}`}
        title={filename}
        actions={
          <>
            {item.documentId ? (
              <Button type="button" variant="secondary" asChild>
                <a href={documentPath(item.documentId)}>Download file</a>
              </Button>
            ) : null}
            {item.status === "undone" ? null : (
              <RowMenu label={`Actions for ${filename}`}>
                <DropdownMenuItem className="min-h-11" onSelect={() => void undo(filename)}>
                  Undo
                </DropdownMenuItem>
              </RowMenu>
            )}
          </>
        }
      />
      <p className="text-sm text-muted-foreground">
        <Link to="/accounts/imports" className="font-semibold text-primary">
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
        {detail.rows.length === 0 && detail.unreadable.length === 0 ? (
          <p className="px-5 py-4 text-muted-foreground">This file has no rows.</p>
        ) : null}
        {detail.rows.map((row) => (
          <DetailRow
            key={row.id}
            row={row}
            onMatch={(transactionId) => {
              clearErrors();
              resolve.mutate({ rowId: row.id, body: { decision: "match", transactionId } });
            }}
            onAddNew={() => {
              clearErrors();
              resolve.mutate({ rowId: row.id, body: { decision: "create" } });
            }}
          />
        ))}
        {detail.unreadable.map((row) => (
          <ListRow key={`line-${row.line}`}>
            <div className={listName}>
              <p>Line {row.line}</p>
              <small>{unreadableLabel(row.reason)}</small>
              <small className="break-all">{row.raw}</small>
              {row.decision === "not_a_transaction" ? <small>Not a transaction</small> : null}
            </div>
            {row.decision === "not_a_transaction" ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  clearErrors();
                  undoDecision.mutate(`import_unreadable:${importId}:${row.line}`);
                }}
              >
                Undo
              </Button>
            ) : (
              <span className="flex flex-wrap gap-2">
                <Badge variant="attention">Unreadable</Badge>
                <Button type="button" onClick={() =>
                    void openEditor("transaction", {
                      id: null,
                      rawLine: row.raw,
                      initialAccountId: item.accountId,
                      unreadableItemKey: `import_unreadable:${importId}:${row.line}`,
                    })
                  }>
                  Add by hand
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    clearErrors();
                    decide.mutate({ asOf: localAsOf(), itemKey: `import_unreadable:${importId}:${row.line}`, decision: "not_a_transaction" });
                  }}
                >
                  Not a transaction
                </Button>
              </span>
            )}
          </ListRow>
        ))}
      </ListCard>
    </>
  );
}

function DetailRow({ row, onMatch, onAddNew }: { row: ImportDetailRow; onMatch: (transactionId: string) => void; onAddNew: () => void }) {
  return (
    <ListRow>
      <div id={`import-row-${row.id}`} className={listName}>
        <p>{row.payeeRaw || "No description"}</p>
        <small>
          {formatStatementDate(row.date)} · {importOutcomeLabel(row.outcome)}
        </small>
        <RowLinks row={row} />
      </div>
      {row.outcome === "needs_review" ? (
        <span className="flex flex-wrap gap-2">
          {row.matches.map((match) => (
            <Button key={match.id} type="button" variant="outline" onClick={() => onMatch(match.id)}>
              Use {match.payeeRaw}
            </Button>
          ))}
          <Button type="button" onClick={onAddNew}>
            Add as new
          </Button>
        </span>
      ) : null}
      <Amount minor={row.amount} />
    </ListRow>
  );
}

function RowLinks({ row }: { row: ImportDetailRow }) {
  const { openEditor } = useEditors();
  const transactionId = row.transactionId;
  if (transactionId) {
    return (
      <button type="button" className="min-h-11 text-left font-semibold text-primary" onClick={() => void openEditor("transaction", { id: transactionId })}>
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
