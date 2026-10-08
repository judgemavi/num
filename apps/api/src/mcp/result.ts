import type { CallToolResult } from "@modelcontextprotocol/server";
import type { z } from "zod";
import { ZodError } from "zod";
import { ServiceError } from "../service-error";
import { validationError } from "../validation";

export function toolResult(data: object): CallToolResult {
  const body = data as Record<string, unknown>;
  return {
    content: [{ type: "text", text: JSON.stringify(body) }],
    structuredContent: body,
  };
}

type StandardSchema = {
  "~standard": {
    version: 1;
    vendor: string;
    validate: (value: unknown) => unknown;
    jsonSchema: {
      input: (options: { target: "draft-07" | "draft-2020-12" }) => Record<string, unknown>;
      output: (options: { target: "draft-07" | "draft-2020-12" }) => Record<string, unknown>;
    };
  };
};

/** Keep the published input schema, and validate in the tool so errors use API codes. */
export function publishedSchema(schema: z.ZodType): z.ZodType {
  const standard = (schema as unknown as StandardSchema)["~standard"];
  return {
    "~standard": {
      version: standard.version,
      vendor: standard.vendor,
      jsonSchema: standard.jsonSchema,
      validate: (value: unknown) => ({ value }),
    },
  } as unknown as z.ZodType;
}

function argQuery(args: unknown): Record<string, string | undefined> {
  if (typeof args !== "object" || args === null) {
    return {};
  }
  const query: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(args)) {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      query[key] = String(value);
    }
  }
  return query;
}

function errorResult(code: string, params: Record<string, string>): CallToolResult {
  return {
    ...toolResult({ code, params }),
    isError: true,
  };
}

export function readTool(args: unknown, load: () => object): CallToolResult {
  try {
    return toolResult(load());
  } catch (error) {
    if (error instanceof ServiceError) {
      return errorResult(error.code, error.params);
    }
    if (error instanceof ZodError) {
      const body = validationError(error, "query", argQuery(args));
      return errorResult(body.code, body.params);
    }
    throw error;
  }
}
