import { retryLazy } from "@/components/retry-lazy";

export const setupScreen = retryLazy<object>(() => import("@/setup-screen").then((module) => ({ default: module.SetupScreen })));
