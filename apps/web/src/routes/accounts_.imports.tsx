import { importViewQuerySchema } from "@num/shared";
import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { ImportViewScreen } from "@/accounts/import-view";

export const Route = createFileRoute("/accounts_/imports")({
  validateSearch: importViewQuerySchema,
  search: {
    middlewares: [stripSearchParams({ page: 1, pageSize: 50 })],
  },
  component: ImportViewScreen,
});
