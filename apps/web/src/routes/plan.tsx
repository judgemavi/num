import { createFileRoute } from "@tanstack/react-router";
import { editOnly } from "@/editors/page-search";
import { PlanScreen } from "@/plan/plan-screen";

export const Route = createFileRoute("/plan")({
  validateSearch: editOnly,
  component: PlanScreen,
});
