import { planSearchSchema } from "@num/shared";
import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { withEdit } from "@/editors/page-search";
import { PlanScreen } from "@/plan/plan-screen";

type Search = { month?: string; edit?: string };

export const Route = createFileRoute("/plan")({
  validateSearch: (search: Record<string, unknown>): Search => withEdit(planSearchSchema, search),
  search: {
    middlewares: [stripSearchParams<Search>({ month: undefined, edit: undefined })],
  },
  component: PlanScreen,
});
