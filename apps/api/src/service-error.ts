import type { ErrorCode } from "@num/shared";

export class ServiceError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly status: 400 | 404 | 409,
    readonly params: Record<string, string> = {},
  ) {
    super(code);
  }
}
