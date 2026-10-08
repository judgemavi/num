import { planListQuerySchema, type PlanListQuery } from "@num/shared";
import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { RecurringScreen } from "@/recurring/recurring-screen";

export const Route = createFileRoute("/recurring")({
  validateSearch: (search: Record<string, unknown>): PlanListQuery => planListQuerySchema.parse(search),
  search: {
    middlewares: [stripSearchParams<PlanListQuery>({ page: 1, pageSize: 50, archived: false })],
  },
  component: RecurringScreen,
});
