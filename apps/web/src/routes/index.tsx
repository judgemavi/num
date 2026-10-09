import { createFileRoute } from "@tanstack/react-router";
import { editOnly } from "@/editors/page-search";
import { HomeScreen } from "@/home/home-screen";

export const Route = createFileRoute("/")({
  validateSearch: editOnly,
  component: HomeScreen,
});
