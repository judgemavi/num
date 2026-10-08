import { planListQuerySchema, type PlanListQuery } from "@num/shared";
import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { withEdit } from "@/editors/page-search";
import { RecurringScreen } from "@/recurring/recurring-screen";

type Search = PlanListQuery & { edit?: string };

export const Route = createFileRoute("/recurring")({
  validateSearch: (search: Record<string, unknown>): Search => withEdit(planListQuerySchema, search),
  search: {
    middlewares: [stripSearchParams<Search>({ page: 1, pageSize: 50, archived: false, edit: undefined })],
  },
  component: RecurringScreen,
});
