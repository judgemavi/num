import { MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { TooltipProvider } from "@/components/ui/tooltip";
import { routeTree } from "./routeTree.gen";
import "./index.css";

// The one invalidation rule: after each successful mutation, all queries are invalidated.
// The promise is returned, thus the mutation stays pending until the active queries have new data.
const queryClient: QueryClient = new QueryClient({
  mutationCache: new MutationCache({
    onSuccess: () => queryClient.invalidateQueries(),
  }),
});

const router = createRouter({
  routeTree,
  context: { queryClient },
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const root = document.getElementById("root");
if (!root) {
  throw new Error("The page is missing the root element.");
}

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={0}>
        <RouterProvider router={router} />
      </TooltipProvider>
    </QueryClientProvider>
  </StrictMode>,
);
