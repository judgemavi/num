import { cn } from "cn";
import { Spinner } from "@/components/ui/spinner";

/** The spinner. The text is only for a screen reader: it tells what loads. */
export function Loading({ label, className }: { label: string; className?: string }) {
  return (
    <div role="status" className={cn("flex items-center text-muted-foreground", className)}>
      <Spinner role="presentation" aria-label={undefined} aria-hidden />
      <span className="sr-only">{label}</span>
    </div>
  );
}
