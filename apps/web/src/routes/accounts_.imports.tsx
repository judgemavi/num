import { importViewQuerySchema, type ImportViewQuery } from "@num/shared";
import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { ImportViewScreen } from "@/accounts/import-view";
import { withEdit } from "@/editors/page-search";

type Search = ImportViewQuery & { edit?: string };

export const Route = createFileRoute("/accounts_/imports")({
  validateSearch: (search: Record<string, unknown>): Search => withEdit(importViewQuerySchema, search),
  search: {
    middlewares: [stripSearchParams<Search>({ page: 1, pageSize: 50, edit: undefined })],
  },
  component: ImportViewScreen,
});
