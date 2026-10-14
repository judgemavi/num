import { errorSchema, type ErrorBody, type ErrorCode } from "@num/shared";
import type { AppType } from "api/routes";
import { hc, type ClientResponse } from "hono/client";

/**
 * The typed client for all calls to the API. The types come from the API routes. No API code is in the bundle.
 *
 * Use `api` only in the files of this folder. A read is a `queryOptions` function. A write is a `useMutation` hook.
 * A component uses `useSuspenseQuery(...)` inside a `Boundary`, and the mutation hook. It does not call `api` or `fetch`.
 *
 * Query keys:
 * - The first part is the resource name: plural for a collection (`"tags"`), singular for one record (`"tag"`).
 * - One record: `["tag", id]`.
 * - A list: `["tags", query]`. `query` is the parsed query object (decision 0004).
 * - A fixed view of a collection: `["tags", "options"]`.
 *
 * No code invalidates a query by its key. After each successful mutation, the rule in `main.tsx` invalidates all queries.
 * The rule does not wait for the new data.
 */
export const api = hc<AppType>("/").api;

export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly params: ErrorBody["params"];

  constructor(body: ErrorBody) {
    super(body.code);
    this.name = "ApiError";
    this.code = body.code;
    this.params = body.params;
  }
}

type OkBody<R> = R extends ClientResponse<infer T, 200, "json"> ? T : never;

/** Give the typed body of a successful response. Throw an `ApiError` with the error code for each other response. */
export async function unwrap<R extends ClientResponse<unknown, number, string>>(request: Promise<R>): Promise<OkBody<R>> {
  const response = await request;
  if (!response.ok) {
    throw new ApiError(errorSchema.parse(await response.json()));
  }
  return (await response.json()) as OkBody<R>;
}

/** The error code of a failed query or mutation. A failure with no API error body has no code. */
export function errorCode(error: Error | null): ErrorCode | undefined {
  return error instanceof ApiError ? error.code : undefined;
}
