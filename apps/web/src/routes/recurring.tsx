import { planListQuerySchema } from "@num/shared";
import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { RecurringScreen } from "@/recurring/recurring-screen";

export const Route = createFileRoute("/recurring")({
  validateSearch: planListQuerySchema,
  search: {
    middlewares: [stripSearchParams({ page: 1, pageSize: 50, archived: false })],
  },
  component: RecurringScreen,
});
