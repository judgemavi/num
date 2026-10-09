import { createFileRoute } from "@tanstack/react-router";
import { editOnly } from "@/editors/page-search";
import { MatchingPage } from "@/settings/matching-page";

export const Route = createFileRoute("/settings/matching")({
  validateSearch: editOnly,
  component: MatchingPage,
});
