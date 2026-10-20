import { useOptionalQuery } from "@/api/optional-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useDeferredValue } from "react";
import { accountQuery } from "@/api/accounts";
import { mortgageTermsQuery } from "@/api/mortgage";
import { AccountForm } from "@/accounts/account-form";
import { AccountImports } from "@/accounts/account-imports";
import { importCountText, unreadableLabel } from "@/accounts/import-format";
import { Button } from "@/components/ui/button";
import { DialogClose, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { EditorInput } from "@/editors/editor-types";
import { DialogBody, DialogPanel } from "@/editors/form-chrome";

export function AccountEditor({ id, name }: EditorInput["account"]) {
  if (id === null) {
    return <AccountForm account={null} initialName={name} />;
  }
  return <SavedAccount id={id} />;
}

function SavedAccount({ id }: { id: string }) {
  const { data: account } = useSuspenseQuery(accountQuery(id));
  // A read in the background can change the kind to mortgage. The terms then load in a transition, thus the form
  // stays on the screen. The list of ids is empty for an account that is not a mortgage.
  const mortgage = useDeferredValue(account.kind === "mortgage");
  const terms = useOptionalQuery(mortgage ? id : null, mortgageTermsQuery);
  return <AccountForm account={account} terms={terms} below={<AccountImports accountId={id} />} />;
}

export function ImportInfoEditor({ filename, counts, unreadable }: EditorInput["importInfo"]) {
  return (
    <DialogPanel>
      <DialogHeader>
        <DialogTitle>Import detail</DialogTitle>
        <DialogDescription>
          {filename} · {importCountText(counts)}
        </DialogDescription>
      </DialogHeader>
      <DialogBody>
        {unreadable.length > 0 ? (
          <ul className="grid gap-3">
            {unreadable.map((row) => (
              <li key={`${row.line}-${row.raw}`} className="grid gap-1 border-t pt-3 text-sm">
                <p className="font-semibold">
                  Line {row.line}. {unreadableLabel(row.reason)}
                </p>
                <p className="break-all text-muted-foreground">{row.raw}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Every row was read.</p>
        )}
      </DialogBody>
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button">Close</Button>
        </DialogClose>
      </DialogFooter>
    </DialogPanel>
  );
}
