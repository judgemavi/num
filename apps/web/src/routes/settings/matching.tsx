import { createFileRoute } from "@tanstack/react-router";
import { MatchingPage } from "@/settings/matching-page";

export const Route = createFileRoute("/settings/matching")({
  component: MatchingPage,
});
