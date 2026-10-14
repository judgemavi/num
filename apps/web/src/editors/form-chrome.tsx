import type { ComponentProps, ReactNode } from "react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useEditorFrame } from "@/editors/editor-api";

export const dialogFrameClass = "flex min-h-0 flex-1 flex-col overflow-hidden";

/** Scrolls between a fixed header and a fixed footer. */
export function DialogBody({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="dialog-body" className={cn("grid min-h-0 flex-1 gap-4 overflow-y-auto px-6 py-4", className)} {...props} />;
}

export function DialogPanel({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn(dialogFrameClass, className)} {...props} />;
}

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

/** The Cancel button of a form. It closes the frame that shows the form: the dialog or the inline place. */
export function FormCancel({ children }: { children: ReactNode }) {
  const { close } = useEditorFrame();
  return (
    <Button type="button" variant="outline" onClick={() => close()}>
      {children}
    </Button>
  );
}
