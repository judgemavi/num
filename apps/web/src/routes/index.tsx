import { createFileRoute } from "@tanstack/react-router";
import { InboxScreen } from "@/inbox/inbox-screen";

export const Route = createFileRoute("/")({
  component: InboxScreen,
});
