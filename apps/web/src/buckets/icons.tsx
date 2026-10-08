import type { BucketIcon } from "@num/shared";
import {
  Baby,
  Briefcase,
  Bus,
  Car,
  Coffee,
  Fuel,
  Gift,
  Heart,
  House,
  Package,
  PawPrint,
  PiggyBank,
  Plane,
  Shield,
  Shirt,
  ShoppingCart,
  Smile,
  Utensils,
  Wallet,
  Wrench,
  type LucideIcon,
} from "lucide-react";

const icons: Record<BucketIcon, LucideIcon> = {
  "shopping-cart": ShoppingCart,
  utensils: Utensils,
  fuel: Fuel,
  smile: Smile,
  package: Package,
  shirt: Shirt,
  "paw-print": PawPrint,
  heart: Heart,
  shield: Shield,
  gift: Gift,
  wrench: Wrench,
  house: House,
  plane: Plane,
  car: Car,
  baby: Baby,
  briefcase: Briefcase,
  "piggy-bank": PiggyBank,
  wallet: Wallet,
  coffee: Coffee,
  bus: Bus,
};

export function BucketGlyph({ name }: { name: BucketIcon }) {
  const Icon = icons[name];
  return <Icon strokeWidth={1.8} aria-hidden="true" />;
}
