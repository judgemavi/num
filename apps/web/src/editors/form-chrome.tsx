import type { ComponentProps, FormEvent, KeyboardEvent, ReactNode } from "react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { DialogClose, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const dialogFrameClass = "flex min-h-0 flex-1 flex-col overflow-hidden";

/** Scrolls between a fixed header and a fixed footer. */
export function DialogBody({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="dialog-body" className={cn("grid min-h-0 flex-1 gap-4 overflow-y-auto px-6 py-4", className)} {...props} />;
}

export function DialogForm({ className, ...props }: ComponentProps<"form">) {
  return <form className={cn(dialogFrameClass, className)} {...props} />;
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

export function FormCancel({ inline = false, onClose, children }: { inline?: boolean; onClose: () => void; children: ReactNode }) {
  if (inline) {
    return (
      <Button type="button" variant="outline" onClick={onClose}>
        {children}
      </Button>
    );
  }
  return (
    <DialogClose asChild>
      <Button type="button" variant="outline">
        {children}
      </Button>
    </DialogClose>
  );
}

/** Inline create sits inside another form. A nested form submits the parent in React 19. */
export function FormShell({
  inline = false,
  className,
  onSubmit,
  children,
}: {
  inline?: boolean;
  className?: string;
  onSubmit: () => void;
  children: ReactNode;
}) {
  if (!inline) {
    return (
      <form
        className={dialogFrameClass}
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        {children}
      </form>
    );
  }
  return (
    <div
      className={className}
      onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key !== "Enter" || event.nativeEvent.isComposing) {
          return;
        }
        const target = event.target;
        if (!(target instanceof HTMLElement) || target.tagName === "TEXTAREA" || target.tagName === "BUTTON") {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        onSubmit();
      }}
    >
      {children}
    </div>
  );
}
