import { merchantListQuerySchema, type MerchantListQuery } from "@num/shared";
import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { MerchantsPage } from "@/settings/merchants-page";

export const Route = createFileRoute("/settings/merchants")({
  validateSearch: (search: Record<string, unknown>): MerchantListQuery => merchantListQuerySchema.parse(search),
  search: {
    middlewares: [stripSearchParams<MerchantListQuery>({ page: 1, pageSize: 50, archived: false })],
  },
  component: MerchantsPage,
});
