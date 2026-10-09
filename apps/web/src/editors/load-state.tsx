import { Button } from "@/components/ui/button";
import { DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DialogBody } from "@/editors/form-chrome";

export function LoadingLine({ label }: { label: string }) {
  return (
    <>
      <DialogHeader>
        <DialogTitle className="sr-only">{label}</DialogTitle>
        <DialogDescription className="sr-only">{label}</DialogDescription>
      </DialogHeader>
      <DialogBody>
        <p className="text-muted-foreground">{label}</p>
      </DialogBody>
    </>
  );
}

export function LoadError({ label, onRetry }: { label: string; onRetry: () => void }) {
  return (
    <>
      <DialogHeader>
        <DialogTitle className="sr-only">{label}</DialogTitle>
        <DialogDescription className="sr-only">{label}</DialogDescription>
      </DialogHeader>
      <DialogBody>
        <div className="grid gap-3">
          <p>{label}</p>
          <Button type="button" onClick={onRetry}>
            Try again
          </Button>
        </div>
      </DialogBody>
    </>
  );
}
