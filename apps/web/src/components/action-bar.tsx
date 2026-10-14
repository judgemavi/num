import type { ReactNode } from "react";

/**
 * The bar of actions for the selected rows (decision 0051, design §6): an ink pill with white text at the bottom centre
 * of the screen, with the dialog shadow. A space at the end of the page keeps the last rows and the pager above it.
 */
export function ActionBar({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <div aria-hidden="true" className="h-24 max-md:h-36" />
      <div
        role="region"
        aria-label={label}
        className="fixed bottom-6 left-1/2 z-40 max-md:bottom-[calc(84px+env(safe-area-inset-bottom))] flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-2 rounded-full bg-foreground py-1.5 pr-1.5 pl-5 text-primary-foreground shadow-[var(--shadow)] max-md:pl-4"
      >
        {children}
      </div>
    </>
  );
}
