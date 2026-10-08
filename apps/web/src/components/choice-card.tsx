import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { RadioGroupItem } from "@/components/ui/radio-group";

type ChoiceCardProps = {
  value: string;
  title: string;
  description: string;
  children?: ReactNode;
};

export function ChoiceCard({ value, title, description }: ChoiceCardProps) {
  return (
    <Label className="grid w-full min-h-11 cursor-pointer grid-cols-[20px_minmax(0,1fr)] items-start gap-2.5 rounded-xl border border-input bg-card p-3 has-data-checked:border-primary has-data-checked:bg-primary-soft">
      <RadioGroupItem value={value} />
      <span>
        <b className="block text-sm font-semibold">{title}</b>
        <span className="block text-[13px] leading-snug font-normal text-muted-foreground">{description}</span>
      </span>
    </Label>
  );
}
