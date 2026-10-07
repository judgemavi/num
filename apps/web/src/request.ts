import { errorSchema, type ErrorCode } from "@num/shared";

type Parser<T> = {
  parse: (data: unknown) => T;
};

export type ApiResult<T> = { ok: true; data: T } | { ok: false; code: ErrorCode };

export async function apiRequest<T>(
  url: string,
  schema: Parser<T>,
  init?: RequestInit,
): Promise<ApiResult<T>> {
  const response = await fetch(url, init);
  const body: unknown = await response.json();
  if (!response.ok) {
    return { ok: false, code: errorSchema.parse(body).code };
  }
  return { ok: true, data: schema.parse(body) };
}
