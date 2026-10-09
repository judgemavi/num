import { Children, isValidElement, type ComponentProps, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { DialogClose, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

function slotOf(node: ReactNode): "header" | "footer" | "body" {
  if (!isValidElement(node)) {
    return "body";
  }
  const slot = (node.type as { dialogSlot?: string }).dialogSlot;
  if (slot === "header" || slot === "footer") {
    return slot;
  }
  return "body";
}

/** Header and footer stay fixed. Only the middle scrolls. */
export function DialogRegions({ children }: { children: ReactNode }) {
  const header: ReactNode[] = [];
  const body: ReactNode[] = [];
  const footer: ReactNode[] = [];
  for (const child of Children.toArray(children)) {
    const slot = slotOf(child);
    if (slot === "header") {
      header.push(child);
    } else if (slot === "footer") {
      footer.push(child);
    } else {
      body.push(child);
    }
  }
  return (
    <>
      {header}
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
        <div className="grid gap-4">{body}</div>
      </div>
      {footer}
    </>
  );
}

const frameClass = "flex min-h-0 flex-1 flex-col overflow-hidden";

export function DialogForm({ className, children, ...props }: ComponentProps<"form">) {
  return (
    <form className={className ? `${frameClass} ${className}` : frameClass} {...props}>
      <DialogRegions>{children}</DialogRegions>
    </form>
  );
}

export function DialogPanel({ className, children, ...props }: ComponentProps<"div">) {
  return (
    <div className={className ? `${frameClass} ${className}` : frameClass} {...props}>
      <DialogRegions>{children}</DialogRegions>
    </div>
  );
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

Object.assign(FormHeading, { dialogSlot: "header" as const });

export function FormActions({ inline = false, children }: { inline?: boolean; children: ReactNode }) {
  if (inline) {
    return <div className="flex flex-row justify-end gap-2">{children}</div>;
  }
  return <DialogFooter>{children}</DialogFooter>;
}

Object.assign(FormActions, { dialogSlot: "footer" as const });

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
        className={frameClass}
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <DialogRegions>{children}</DialogRegions>
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
