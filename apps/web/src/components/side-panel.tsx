import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type SidePanelProps = {
  title: string;
  text?: string;
  children?: ReactNode;
  action?: ReactNode;
};

export function SidePanel({ title, text, children, action }: SidePanelProps) {
  return (
    <Card>
      <CardHeader className="px-5 pt-5 pb-0">
        <CardTitle className="text-base font-bold">{title}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2.5 px-5 pt-2.5 pb-5">
        {text ? <p className="text-sm text-muted-foreground">{text}</p> : null}
        {children}
        {action}
      </CardContent>
    </Card>
  );
}
