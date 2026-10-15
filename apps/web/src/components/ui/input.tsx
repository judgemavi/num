import * as React from "react"
import { cn } from "cn"
import { fieldControl } from "@/components/field-control"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(fieldControl, "placeholder:text-muted-foreground", className)}
      {...props}
    />
  )
}

export { Input }
