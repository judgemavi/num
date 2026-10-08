import { createFileRoute } from "@tanstack/react-router";
import { ImportDetailScreen } from "@/accounts/import-detail";
import { editOnly } from "@/editors/page-search";

export const Route = createFileRoute("/accounts_/imports_/$importId")({
  validateSearch: editOnly,
  component: ImportDetailScreen,
});
