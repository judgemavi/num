import { merchantListQuerySchema, searchWithDefaults } from "@num/shared";
import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { MerchantsPage } from "@/settings/merchants-page";

export const Route = createFileRoute("/settings/merchants")({
  validateSearch: searchWithDefaults(merchantListQuerySchema),
  search: {
    middlewares: [stripSearchParams({ page: 1, pageSize: 50, archived: false })],
  },
  component: MerchantsPage,
});
