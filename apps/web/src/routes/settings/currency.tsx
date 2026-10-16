import { bookCurrencyQuery } from "@/api/settings";
import { createFileRoute } from "@tanstack/react-router";
import { CurrencyPage } from "@/settings/currency-page";

export const Route = createFileRoute("/settings/currency")({
  loader: ({ context }) => {
    void context.queryClient.prefetchQuery(bookCurrencyQuery());
  },
  component: CurrencyPage,
});
