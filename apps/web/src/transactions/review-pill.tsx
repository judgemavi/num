import { Badge } from "@/components/ui/badge";

/** The review text uses the same status tone in the table and the editor. */
export function ReviewPill({ text }: { text: string | null }) {
  if (text === null) return null;
  const variant = text === "Sure" ? "positive" : text === "Likely" ? "neutral" : "attention";
  return <Badge variant={variant}>{text}</Badge>;
}
