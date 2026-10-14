import type { CallToolResult, StandardSchemaWithJSON } from "@modelcontextprotocol/server";
import type { z } from "zod";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function toolResult(data: Record<string, unknown>): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data) }],
    structuredContent: data,
  };
}

const asOfDate = {
  format: "date",
  pattern: String.raw`^\d{4}-\d{2}-\d{2}$`,
};

function withAsOfDate(schema: Record<string, unknown>) {
  const properties = schema.properties;
  if (!isRecord(properties) || !isRecord(properties.asOf)) {
    return schema;
  }
  return {
    ...schema,
    properties: { ...properties, asOf: { ...properties.asOf, ...asOfDate } },
  };
}

// Pinned to @modelcontextprotocol/server 2.3.1. That version checks tool input
// before the handler and returns an English sentence. This wrapper keeps the
// published JSON schema, including asOf as a date, and skips that check.
// The handler validates with the shared Zod schema and returns an API error code.
export function publishedSchema(schema: z.ZodType): StandardSchemaWithJSON<Record<string, unknown>> {
  const standard = schema["~standard"];
  return {
    "~standard": {
      version: standard.version,
      vendor: standard.vendor,
      jsonSchema: {
        input: (options) => withAsOfDate(standard.jsonSchema.input(options)),
        output: (options) => withAsOfDate(standard.jsonSchema.output(options)),
      },
      validate: (value) => (isRecord(value) ? { value } : { issues: [{ message: "The tool arguments must be an object." }] }),
    },
  };
}
