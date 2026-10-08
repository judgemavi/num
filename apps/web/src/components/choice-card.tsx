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
    <Label className="choice">
      <RadioGroupItem value={value} />
      <span>
        <b>{title}</b>
        <span className="choice-copy">{description}</span>
      </span>
    </Label>
  );
}
