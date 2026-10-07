import { createFileRoute } from "@tanstack/react-router";
import { AccountsScreen } from "@/accounts/accounts-screen";

export const Route = createFileRoute("/accounts")({
  component: AccountsScreen,
});
