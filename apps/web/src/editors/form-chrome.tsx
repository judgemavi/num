import type { ReactNode } from "react";
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function FormHeading({ inline = false, title, description }: { inline?: boolean; title: string; description: string }) {
  if (inline) {
    return (
      <div className="grid gap-1">
        <h3 className="font-display text-xl leading-none font-extrabold uppercase">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    );
  }
  return (
    <DialogHeader>
      <DialogTitle>{title}</DialogTitle>
      <DialogDescription>{description}</DialogDescription>
    </DialogHeader>
  );
}

export function FormActions({ inline = false, children }: { inline?: boolean; children: ReactNode }) {
  if (inline) {
    return <div className="flex flex-row justify-end gap-2">{children}</div>;
  }
  return <DialogFooter>{children}</DialogFooter>;
}
