import type { FormEvent, KeyboardEvent, ReactNode } from "react";
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
        className={className}
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
