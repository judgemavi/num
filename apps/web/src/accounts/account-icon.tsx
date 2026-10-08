import type { AccountKind } from "@num/shared";
import { Banknote, CreditCard, HandCoins, House, Landmark, TrendingUp, Wallet, type LucideIcon } from "lucide-react";

const icons: Record<AccountKind, LucideIcon> = {
  chequing: Banknote,
  cash: Banknote,
  credit_card: CreditCard,
  savings: Wallet,
  investment: TrendingUp,
  property: House,
  receivable: HandCoins,
  other_asset: Landmark,
  mortgage: House,
  loan: Banknote,
  other_liability: Banknote,
};

export function AccountIcon({ kind }: { kind: AccountKind }) {
  const Icon = icons[kind];
  return <Icon size={20} strokeWidth={1.8} aria-hidden="true" />;
}
