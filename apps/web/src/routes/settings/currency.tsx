import { createFileRoute } from "@tanstack/react-router";
import { CurrencyPage } from "@/settings/currency-page";

export const Route = createFileRoute("/settings/currency")({
  component: CurrencyPage,
});
