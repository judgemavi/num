import { hueColor, type Hue } from "@/components/hue";
import { Progress } from "@/components/ui/progress";

export function BucketBar({ hue, balance, target, label }: { hue: Hue; balance: number; target: number; label: string }) {
  const over = balance < 0;
  const percent = target <= 0 ? (over ? 0 : 100) : Math.min(100, Math.max(0, Math.round((balance * 100) / target)));
  return (
    <Progress
      value={over ? 0 : percent}
      aria-label={label}
      className={over ? "bg-attn-soft" : "bg-sunken"}
      style={{ "--progress-fill": hueColor[hue].glyph }}
    />
  );
}
