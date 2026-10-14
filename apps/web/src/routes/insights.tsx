import { insightsSearchSchema } from "@num/shared";
import { createFileRoute } from "@tanstack/react-router";
import { InsightsScreen } from "@/insights/insights-screen";

export const Route = createFileRoute("/insights")({
  validateSearch: insightsSearchSchema,
  component: InsightsScreen,
});
