import { createFileRoute } from "@tanstack/react-router";
import { editOnly } from "@/editors/page-search";
import { SettingsLayout } from "@/settings/settings-layout";

export const Route = createFileRoute("/settings")({
  validateSearch: editOnly,
  component: SettingsLayout,
});
