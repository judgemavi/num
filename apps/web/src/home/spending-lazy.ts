import { retryLazy } from "@/components/retry-lazy";

export const spendingContent = retryLazy<object>(() => import("@/home/spending-content").then((module) => ({ default: module.SpendingContent })));
