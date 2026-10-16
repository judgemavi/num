import type { ReactNode } from "react";
import { cn } from "cn";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** The skeleton of content that loads. The text is only for a screen reader: it tells what loads. */
function Loading({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div role="status" className={className}>
      <div aria-hidden>{children}</div>
      <span className="sr-only">{label}</span>
    </div>
  );
}

const nameWidths = ["w-2/5", "w-1/3", "w-1/2", "w-1/4", "w-2/5"];

/** Rows in the shape of a ListCard row: the icon tile, the name and its second line, the amount. */
function SkeletonRows({ count }: { count: number }) {
  return nameWidths.slice(0, count).map((width, index) => (
    <div key={index} className="flex min-h-[60px] items-center gap-3 border-t px-5 py-2 first:border-t-0">
      <Skeleton className="size-10 shrink-0 rounded-[10px]" />
      <div className="grid flex-1 gap-2">
        <Skeleton className={cn("h-4", width)} />
        <Skeleton className="h-3 w-1/5" />
      </div>
      <Skeleton className="h-4 w-20 shrink-0" />
    </div>
  ));
}

/** A ListCard of rows. */
export function PageSkeleton({ label, className }: { label: string; className?: string }) {
  return (
    <Loading label={label} className={className}>
      <Card className="gap-0 py-0">
        <SkeletonRows count={5} />
      </Card>
    </Loading>
  );
}

/** Rows inside a ListCard that is already on the screen. */
export function RowsSkeleton({ label }: { label: string }) {
  return (
    <Loading label={label}>
      <SkeletonRows count={3} />
    </Loading>
  );
}

/** Fields of a form: a label above each input. */
export function FieldsSkeleton({ label, count }: { label: string; count: number }) {
  return (
    <Loading label={label} className="grid gap-5">
      {nameWidths.slice(0, count).map((width, index) => (
        <div key={index} className="grid gap-2">
          <Skeleton className={cn("h-3.5", width)} />
          <Skeleton className="h-11 w-full rounded-md" />
        </div>
      ))}
    </Loading>
  );
}
