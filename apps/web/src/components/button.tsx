import type { ComponentProps } from "react";
import { Button as UiButton } from "@/components/ui/button";

export function Button(props: ComponentProps<typeof UiButton>) {
  return <UiButton {...props} />;
}
