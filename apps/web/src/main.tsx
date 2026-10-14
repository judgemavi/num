import { MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ApiError } from "@/api/client";
import { TooltipProvider } from "@/components/ui/tooltip";
import { routeTree } from "./routeTree.gen";
import "./index.css";

// The one invalidation rule: after each successful mutation, all queries are invalidated.
// The promise is not returned, thus the mutation does not wait: a form closes when its write succeeds, and the
// active queries load again in the background.
//
// The defaults of each read:
// - An answer of the API with an error code is final. A second request gets the same answer, thus it is not sent.
//   A request that got no answer from the API is sent one more time.
// - A read stays fresh for 30 seconds. A component that mounts in that time uses the data and does not read again.
//   A write makes all reads stale at once, thus the screen does not show data from before a write.
const queryClient: QueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => !(error instanceof ApiError) && failureCount < 1,
      staleTime: 30_000,
    },
  },
  mutationCache: new MutationCache({
    onSuccess: () => {
      void queryClient.invalidateQueries();
    },
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
