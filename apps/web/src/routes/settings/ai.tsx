import { aiAccessQuery } from "@/api/settings";
import { createFileRoute } from "@tanstack/react-router";
import { AiAccessPage } from "@/settings/ai-access-page";

export const Route = createFileRoute("/settings/ai")({
  loader: ({ context }) => {
    void context.queryClient.prefetchQuery(aiAccessQuery());
  },
  component: AiAccessPage,
});
