import { MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { toast } from "sonner";
import { ApiError, errorCode } from "@/api/client";
import { fillPaid } from "@/api/funding";
import { AutoFill } from "@/components/auto-fill";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { parseSearch, stringifySearch } from "@/lists/search-params";
import { routeTree } from "./routeTree.gen";
import "./index.css";

// The one invalidation rule: after each successful mutation, all queries are invalidated.
// The promise is not returned, thus the mutation does not wait: a form closes when its write succeeds, and the
// active queries load again in the background.
//
// The automatic fill (`meta.fill`, `AutoFill`) runs after each other write. It invalidates the reads only when it paid or made the emergency bucket,
// and it shows no error toast.
//
// The one error rule: a failed write shows an error toast. A form shows the error of its write in the form
// (`formApi.setErrorMap`), thus a mutation hook of a form has `meta.form` and gets no toast. The text comes from
// `meta.errorText` of the hook, or is the general text.
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
    onSuccess: (data, _variables, _context, mutation) => {
      if (mutation.meta?.fill && !fillPaid(data)) {
        return;
      }
      void queryClient.invalidateQueries();
    },
    onError: (error, _variables, _context, mutation) => {
      if (mutation.meta?.form || mutation.meta?.fill) {
        return;
      }
      toast.error(mutation.meta?.errorText?.(errorCode(error)) ?? "That change did not save. Try again.");
    },
  }),
});

const router = createRouter({
  routeTree,
  context: { queryClient },
  parseSearch,
  stringifySearch,
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
        <AutoFill />
        <Toaster position="bottom-center" />
      </TooltipProvider>
    </QueryClientProvider>
  </StrictMode>,
);
