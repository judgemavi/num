import { useUndoImportFlow } from "@/accounts/use-undo-import-flow";
import { useSuspenseQuery } from "@tanstack/react-query";
import { accountQuery } from "@/api/accounts";
import { accountImportsQuery } from "@/api/imports";
import { formatImportDate, importCountText } from "@/accounts/import-format";
import { accountLabel } from "@/accounts/label";
import { useEditors } from "@/editors/editor-api";
import { Boundary } from "@/components/boundary";
import { ListCard, ListRow, listName } from "@/components/list-card";
import { RowMenu } from "@/components/row-menu";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

/** The imports of one account. The parent reads the account first, thus the read of the account here does not wait. */
export function AccountImports({ accountId }: { accountId: string }) {
  const { data: account } = useSuspenseQuery(accountQuery(accountId));


  return (
    <div className="grid gap-3">
      <ListCard label={`Imports for ${accountLabel(account)}`} title="Imports">
        <Boundary look="rows" loading="Loading imports." failed="The imports did not load.">
          <ImportRows accountId={accountId} />
        </Boundary>
      </ListCard>
    </div>
  );
}

function ImportRows({ accountId }: { accountId: string }) {
  const undo = useUndoImportFlow();
  const { openEditor } = useEditors();
  const { data: imports } = useSuspenseQuery(accountImportsQuery(accountId));
  if (imports.length === 0) {
    return <p className="px-5 py-4 text-muted-foreground">No imports yet.</p>;
  }
  return imports.map((item) => (
    <ListRow
      key={item.id}
      size="simple"
      label={formatImportDate(item.createdAt)}
      onOpen={() => void openEditor("importInfo", { filename: item.filename, counts: item.counts, unreadable: item.unreadable })}
      menu={
        item.undoneAt ? null : (
          <RowMenu label={`Actions for the import on ${formatImportDate(item.createdAt)}`}>
            <DropdownMenuItem className="min-h-11" onSelect={() => void undo(item)}>
              Undo
            </DropdownMenuItem>
          </RowMenu>
        )
      }
    >
      <div className={listName}>
        {formatImportDate(item.createdAt)}
        <small>
          {item.filename ?? "Statement"}
          {item.undoneAt ? " · Undone" : ""}
        </small>
      </div>
      <p className="text-right text-[13px] text-muted-foreground">{importCountText(item.counts)}</p>
    </ListRow>
  ));
}
