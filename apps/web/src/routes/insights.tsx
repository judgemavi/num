import { insightsSearchSchema, type InsightsSearch } from "@num/shared";
import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { withEdit } from "@/editors/page-search";
import { InsightsScreen } from "@/insights/insights-screen";

type Search = InsightsSearch & { edit?: string };

export const Route = createFileRoute("/insights")({
  validateSearch: (search: Record<string, unknown>): Search => withEdit(insightsSearchSchema, search),
  search: {
    middlewares: [stripSearchParams<Search>({ edit: undefined })],
  },
  component: InsightsScreen,
});
