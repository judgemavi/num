import type { ReactNode } from "react";
import { Ellipsis } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ItemActions } from "@/components/ui/item";

/** The "More" menu of a row. It is above the target of the row, at the top right of the row. */
export function RowMenu({ label, children }: { label: string; children: ReactNode }) {
  return (
    <ItemActions className="relative z-10">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="icon" aria-label={label}>
            <Ellipsis strokeWidth={1.8} aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">{children}</DropdownMenuContent>
      </DropdownMenu>
    </ItemActions>
  );
}
