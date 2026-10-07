import type { LucideIcon } from "lucide-react";
import {
  ArrowLeftRight,
  CalendarRange,
  Inbox,
  Landmark,
  Repeat,
  Settings,
  Sparkles,
  Wallet,
} from "lucide-react";

export const navItems = [
  { to: "/", label: "Inbox", icon: Inbox },
  { to: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { to: "/plan", label: "Plan", icon: CalendarRange },
  { to: "/buckets", label: "Buckets", icon: Wallet },
  { to: "/insights", label: "Insights", icon: Sparkles },
  { to: "/accounts", label: "Accounts", icon: Landmark },
  { to: "/recurring", label: "Recurring", icon: Repeat },
  { to: "/settings", label: "Settings", icon: Settings },
] as const satisfies readonly {
  to: string;
  label: string;
  icon: LucideIcon;
}[];

export type NavPath = (typeof navItems)[number]["to"];
