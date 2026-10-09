import { createFileRoute } from "@tanstack/react-router";
import { editOnly } from "@/editors/page-search";
import { AiAccessPage } from "@/settings/ai-access-page";

export const Route = createFileRoute("/settings/ai")({
  validateSearch: editOnly,
  component: AiAccessPage,
});
