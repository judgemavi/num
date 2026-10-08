import { createFileRoute } from "@tanstack/react-router";
import { SettingsIndex } from "@/settings/settings-index";

export const Route = createFileRoute("/settings/")({
  component: SettingsIndex,
});
