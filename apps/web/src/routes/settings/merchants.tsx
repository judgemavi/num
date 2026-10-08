import { merchantListQuerySchema, type MerchantListQuery } from "@num/shared";
import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { withEdit } from "@/editors/page-search";
import { MerchantsPage } from "@/settings/merchants-page";

type Search = MerchantListQuery & { edit?: string };

export const Route = createFileRoute("/settings/merchants")({
  validateSearch: (search: Record<string, unknown>): Search => withEdit(merchantListQuerySchema, search),
  search: {
    middlewares: [stripSearchParams<Search>({ page: 1, pageSize: 50, archived: false, edit: undefined })],
  },
  component: MerchantsPage,
});
