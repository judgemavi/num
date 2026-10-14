import { createFileRoute } from "@tanstack/react-router";
import { AiAccessPage } from "@/settings/ai-access-page";

export const Route = createFileRoute("/settings/ai")({
  component: AiAccessPage,
});
