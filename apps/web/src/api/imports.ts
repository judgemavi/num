import type { ColumnMap, ImportReviewResolve, ImportViewQuery } from "@num/shared";
import { queryOptions, useMutation } from "@tanstack/react-query";
import { api, unwrap } from "@/api/client";

export function importPresetsQuery() {
  return queryOptions({
    queryKey: ["import-presets"],
    queryFn: async () => (await unwrap(api["import-presets"].$get())).presets,
  });
}

export function accountImportsQuery(accountId: string) {
  return queryOptions({
    queryKey: ["imports", accountId],
    queryFn: async () => (await unwrap(api.accounts[":id"].imports.$get({ param: { id: accountId } }))).items,
  });
}

export function importViewQuery(search: ImportViewQuery) {
  return queryOptions({
    queryKey: ["import-view", search],
    queryFn: () => unwrap(api.imports.$get({ query: search })),
  });
}

export function importDetailQuery(id: string) {
  return queryOptions({
    queryKey: ["import-detail", id],
    queryFn: () => unwrap(api.imports[":id"].$get({ param: { id } })),
  });
}

type ImportFileInput = {
  file: File;
  accountId: string;
  asOf: string;
  presetId: string | null;
  columnMap: ColumnMap | null;
};

/** Import one statement file. The result is the import, a preview that needs a column map, or the unreadable rows. */
export function useImportFile() {
  return useMutation({
    mutationFn: ({ file, accountId, asOf, presetId, columnMap }: ImportFileInput) =>
      unwrap(
        api.imports.$post({
          form: {
            file,
            accountId,
            asOf,
            ...(presetId ? { presetId } : {}),
            ...(columnMap ? { columnMap: JSON.stringify(columnMap) } : {}),
          },
        }),
      ),
  });
}

/** Answer an import row that needs review: use an existing transaction or add a new one. */
export function useResolveImportRow() {
  return useMutation({
    mutationFn: ({ rowId, body }: { rowId: string; body: ImportReviewResolve }) =>
      unwrap(api.imports.rows[":id"].resolve.$post({ param: { id: rowId }, json: body })),
  });
}

export function useUndoImport() {
  return useMutation({
    mutationFn: (id: string) => unwrap(api.imports[":id"].undo.$post({ param: { id } })),
  });
}
