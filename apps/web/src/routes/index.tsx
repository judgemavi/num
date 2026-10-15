import { insightsSearchSchema, searchWithDefaults } from "@num/shared";
import { createFileRoute } from "@tanstack/react-router";
import { startHomeReads } from "@/home/home-reads";
import { HomeScreen } from "@/home/home-screen";

export const Route = createFileRoute("/")({
  validateSearch: searchWithDefaults(insightsSearchSchema),
  loader: ({ context }) => startHomeReads(context.queryClient),
  component: HomeScreen,
});
