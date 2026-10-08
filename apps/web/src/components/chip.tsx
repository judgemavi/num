import type { ComponentProps, ReactNode } from "react";

type ChipProps = Omit<ComponentProps<"button">, "type"> & {
  pressed: boolean;
  children: ReactNode;
};

export function Chip({ pressed, children, ...props }: ChipProps) {
  return (
    <button type="button" className="chip" aria-pressed={pressed} {...props}>
      {children}
    </button>
  );
}
