import { insightsSearchSchema, searchWithDefaults } from "@num/shared";
import { createFileRoute } from "@tanstack/react-router";
import { startHomeReads } from "@/home/home-reads";
import { pageQuery } from "@/editors/page-search";
import { HomeScreen } from "@/home/home-screen";

export const Route = createFileRoute("/")({
  validateSearch: searchWithDefaults(insightsSearchSchema),
  loaderDeps: ({ search }) => pageQuery(search),
  loader: ({ context, deps }) => startHomeReads(context.queryClient, deps),
  component: HomeScreen,
});
