import { Button } from "@/components/ui/button";

export function LoadingLine({ label }: { label: string }) {
  return <p className="text-muted-foreground">{label}</p>;
}

export function LoadError({ label, onRetry }: { label: string; onRetry: () => void }) {
  return (
    <div className="grid gap-3">
      <p>{label}</p>
      <Button type="button" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}
