import { createFileRoute } from "@tanstack/react-router";
import { editOnly } from "@/editors/page-search";

export const Route = createFileRoute("/plan")({
  validateSearch: editOnly,
});
