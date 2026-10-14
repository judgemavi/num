import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext } from "@tanstack/react-router";
import { editSearch } from "@/editors/page-search";
import { RootLayout } from "@/shell";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  validateSearch: editSearch,
  component: RootLayout,
});
