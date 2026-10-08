import { importViewQuerySchema, type ImportViewQuery } from "@num/shared";
import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { ImportViewScreen } from "@/accounts/import-view";

export const Route = createFileRoute("/accounts_/imports")({
  validateSearch: (search: Record<string, unknown>): ImportViewQuery => importViewQuerySchema.parse(search),
  search: {
    middlewares: [stripSearchParams<ImportViewQuery>({ page: 1, pageSize: 50 })],
  },
  component: ImportViewScreen,
});
