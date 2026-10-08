import { createFileRoute } from "@tanstack/react-router";
import { ImportDetailScreen } from "@/accounts/import-detail";

export const Route = createFileRoute("/accounts_/imports_/$importId")({
  component: ImportDetailScreen,
});
