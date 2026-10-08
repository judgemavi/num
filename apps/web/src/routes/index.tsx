import { createFileRoute } from "@tanstack/react-router";
import { editOnly } from "@/editors/page-search";
import { InboxScreen } from "@/inbox/inbox-screen";

export const Route = createFileRoute("/")({
  validateSearch: editOnly,
  component: InboxScreen,
});
