import { useMutation } from "@tanstack/react-query";
import { api, unwrap } from "@/api/client";
import { importError } from "@/accounts/import-format";

/** The link that downloads a stored document. */
export function documentPath(id: string): string {
  return api.documents[":id"].$path({ param: { id } });
}

/** Erase the file of a document. The record of the document, the import and its transactions stay (decision 0041). */
export function useEraseDocument() {
  return useMutation({
    meta: { errorText: importError },
    mutationFn: (id: string) => unwrap(api.documents[":id"].$delete({ param: { id } })),
  });
}
