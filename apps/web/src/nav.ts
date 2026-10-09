import type { LucideIcon } from "lucide-react";
import { ArrowLeftRight, ChartColumn, House, Landmark, Repeat, Settings, Wallet } from "lucide-react";

type NavItem = {
  to: "/" | "/transactions" | "/buckets" | "/accounts" | "/insights" | "/recurring" | "/settings";
  label: string;
  icon: LucideIcon;
};

export const primaryNav = [
  { to: "/", label: "Home", icon: House },
  { to: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { to: "/buckets", label: "Buckets", icon: Wallet },
  { to: "/accounts", label: "Accounts", icon: Landmark },
] as const satisfies readonly NavItem[];

export const moreNav = [
  { to: "/insights", label: "Insights", icon: ChartColumn },
  { to: "/recurring", label: "Recurring", icon: Repeat },
] as const satisfies readonly NavItem[];

export const settingsNav = { to: "/settings", label: "Settings", icon: Settings } as const satisfies NavItem;

export const phoneMoreNav = [...moreNav, settingsNav] as const satisfies readonly NavItem[];

export type NavPath = NavItem["to"];
