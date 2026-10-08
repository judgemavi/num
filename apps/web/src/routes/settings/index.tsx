import { createFileRoute } from "@tanstack/react-router";
import { editOnly } from "@/editors/page-search";
import { SettingsIndex } from "@/settings/settings-index";

export const Route = createFileRoute("/settings/")({
  validateSearch: editOnly,
  component: SettingsIndex,
});
