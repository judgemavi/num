import { useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";

type DisclosureProps = {
  label: string;
  defaultOpen?: boolean;
  children: ReactNode;
};

export function Disclosure({ label, defaultOpen = false, children }: DisclosureProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button type="button" className="disclose" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <ChevronRight size={20} strokeWidth={1.8} aria-hidden="true" style={{ transform: open ? "rotate(90deg)" : undefined }} />
        {label}
      </button>
      {open ? children : null}
    </div>
  );
}
