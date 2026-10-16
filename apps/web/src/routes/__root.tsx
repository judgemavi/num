import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext } from "@tanstack/react-router";
import { setupStatusQuery } from "@/api/setup";
import { setupScreen } from "@/setup-lazy";
import { editSearch } from "@/editors/page-search";
import { RootLayout } from "@/shell";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  validateSearch: editSearch,
  loader: ({ context: { queryClient } }) => {
    // Start setup early. The screen Boundary shows read and import failures.
    void queryClient.ensureQueryData(setupStatusQuery()).then((setup) => {
      if (!setup.complete) void setupScreen.preload().catch(() => undefined);
    }).catch(() => undefined);
  },
  component: RootLayout,
});
