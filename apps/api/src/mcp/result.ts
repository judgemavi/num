import type { CallToolResult } from "@modelcontextprotocol/server";
import type { z } from "zod";

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

const asOfDate = {
  format: "date",
  pattern: String.raw`^\d{4}-\d{2}-\d{2}$`,
};

function withAsOfDate(schema: Record<string, unknown>) {
  const properties = schema.properties;
  if (typeof properties !== "object" || properties === null || !("asOf" in properties)) {
    return schema;
  }
  const asOf = (properties as Record<string, unknown>).asOf;
  if (typeof asOf !== "object" || asOf === null) {
    return schema;
  }
  return {
    ...schema,
    properties: {
      ...(properties as Record<string, unknown>),
      asOf: { ...(asOf as Record<string, unknown>), ...asOfDate },
    },
  };
}

// Pinned to @modelcontextprotocol/server 2.3.1. That version checks tool input
// before the handler and returns an English sentence. This wrapper keeps the
// published JSON schema, including asOf as a date, and skips that check.
// The handler validates with the shared Zod schema and returns an API error code.
export function publishedSchema(schema: z.ZodType): z.ZodType {
  const standard = (schema as unknown as StandardSchema)["~standard"];
  const jsonSchema = standard.jsonSchema;
  return {
    "~standard": {
      version: standard.version,
      vendor: standard.vendor,
      jsonSchema: {
        input: (options: { target: "draft-07" | "draft-2020-12" }) => withAsOfDate(jsonSchema.input(options)),
        output: (options: { target: "draft-07" | "draft-2020-12" }) => withAsOfDate(jsonSchema.output(options)),
      },
      validate: (value: unknown) => ({ value }),
    },
  } as unknown as z.ZodType;
}
