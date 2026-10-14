import { createFileRoute } from "@tanstack/react-router";
import { ImportDetailScreen } from "@/accounts/import-detail";
import { importDetailQuery } from "@/api/imports";

export const Route = createFileRoute("/accounts_/imports_/$importId")({
  // The read of the import starts with the navigation. It does not wait for the code of the page.
  loader: ({ context: { queryClient }, params: { importId } }) => {
    void queryClient.prefetchQuery(importDetailQuery(importId));
  },
  component: ImportDetailScreen,
});
