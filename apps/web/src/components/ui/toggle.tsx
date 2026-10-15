import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { Toggle as TogglePrimitive } from "radix-ui"

const toggleVariants = cva(
  "group/toggle inline-flex items-center justify-center gap-1.5 rounded-full text-sm font-semibold whitespace-nowrap transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-transparent hover:bg-sunken",
        // The Chip of docs/design.md §6: a separate pill with a `control` border. Selected: iris fill, white text.
        outline:
          "border border-input bg-card text-foreground hover:bg-sunken data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:hover:bg-primary-hover",
      },
      size: {
        default: "h-11 min-h-11 px-3.5",
        sm: "h-11 min-h-11 px-3 text-sm",
        lg: "h-11 min-h-11 px-4",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Toggle({
  className,
  variant = "default",
  size = "default",
  ...props
}: React.ComponentProps<typeof TogglePrimitive.Root> &
  VariantProps<typeof toggleVariants>) {
  return (
    <TogglePrimitive.Root
      data-slot="toggle"
      className={cn(toggleVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Toggle, toggleVariants }
