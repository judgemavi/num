import { insightsSearchSchema, searchWithDefaults } from "@num/shared";
import { createFileRoute } from "@tanstack/react-router";
import { InsightsScreen } from "@/insights/insights-screen";

export const Route = createFileRoute("/insights")({
  validateSearch: searchWithDefaults(insightsSearchSchema),
  component: InsightsScreen,
});
