import { useUndoImportFlow } from "@/accounts/use-undo-import-flow";
import type { ImportDetailRow } from "@num/shared";
import { useSuspenseQuery } from "@tanstack/react-query";
import { getRouteApi, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { errorCode } from "@/api/client";
import { importDetailQuery, useResolveImportRow } from "@/api/imports";
import { useDecideItem, useUndoDecision } from "@/api/review";
import { ImportBalanceProblem } from "@/accounts/import-balance-problem";
import {
  brokenMatch,
  formatImportDate,
  formatImportPeriod,
  formatStatementDate,
  importCountText,
  importError,
  importOutcomeLabel,
  importStatusLabel,
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
  const { openEditor } = useEditors();
  const accountLabels = useAccountLabels();
  const { data: detail } = useSuspenseQuery(importDetailQuery(importId));
  const undo = useUndoImportFlow();
  const decide = useDecideItem();
  const undoDecision = useUndoDecision();
  useEffect(() => {
    const id = window.location.hash.replace("#", "");
    if (!id) {
      return;
    }
    document.getElementById(id)?.scrollIntoView({ block: "center" });
  }, [detail]);

  const item = detail.item;
  const difference = brokenMatch(item.balanceCheck);

  return (
    <>
      <PageHeader
        kicker={`${accountLabels.get(item.accountId) ?? item.accountName} · ${formatImportDate(item.createdAt)}`}
        title={item.filename}
        actions={
          item.status === "undone" ? null : (
            <RowMenu label={`Actions for ${item.filename}`}>
              <DropdownMenuItem className="min-h-11" onSelect={() => void undo(item)}>
                Undo this import
              </DropdownMenuItem>
            </RowMenu>
          )
        }
      />
      {difference !== null ? <ImportBalanceProblem difference={difference} /> : null}
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
      <ListCard label="Rows in this file" title="Rows">
        {detail.rows.length === 0 && detail.unreadable.length === 0 ? (
          <p className="px-5 py-4 text-muted-foreground">This file has no rows.</p>
        ) : null}
        {detail.rows.map((row) => (
          <DetailRow key={row.id} row={row} />
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

function DetailRow({ row }: { row: ImportDetailRow }) {
  const resolve = useResolveImportRow();
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
            <Button key={match.id} type="button" variant="outline" onClick={() => resolve.mutate({ rowId: row.id, body: { decision: "match", transactionId: match.id } })}>
              Use {match.payeeRaw}
            </Button>
          ))}
          <Button type="button" onClick={() => resolve.mutate({ rowId: row.id, body: { decision: "create" } })}>
            Add as new
          </Button>
        </span>
      ) : null}
      <Amount value={row.amount} />
    </ListRow>
  );
}

function RowLinks({ row }: { row: ImportDetailRow }) {
  const { openEditor } = useEditors();
  const transactionId = row.transactionId;
  if (transactionId) {
    return (
      <Button type="button" variant="link" className="justify-start px-0" onClick={() => void openEditor("transaction", { id: transactionId })}>
        Open transaction
      </Button>
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
