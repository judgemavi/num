import { createHash } from "node:crypto";
import { z } from "zod";
import type { McpRoute } from "./catalog";

const fileInputSchema = z.object({
  filename: z.string().min(1),
  mimeType: z.string(),
  contentBase64: z.string(),
});

type FileInput = z.infer<typeof fileInputSchema>;

export function shapeOf(schema: z.ZodType | undefined): Record<string, z.ZodType> {
  if (!schema || !("shape" in schema)) {
    return {};
  }
  return (schema as { shape: Record<string, z.ZodType> }).shape;
}

function unionOptions(schema: z.ZodType | undefined): z.ZodType[] {
  if (!schema || !("options" in schema)) {
    return [];
  }
  const options = (schema as { options?: z.ZodType[] }).options;
  return Array.isArray(options) ? options : [];
}

export function fieldSchema(schema: z.ZodType | undefined, key: string): z.ZodType | undefined {
  const direct = shapeOf(schema)[key];
  if (direct) {
    return direct;
  }
  for (const option of unionOptions(schema)) {
    const found = shapeOf(option)[key];
    if (found) {
      return found;
    }
  }
  return undefined;
}

export function fieldKeys(schema: z.ZodType | undefined): string[] {
  const direct = Object.keys(shapeOf(schema));
  if (direct.length > 0) {
    return direct;
  }
  const keys = new Set<string>();
  for (const option of unionOptions(schema)) {
    for (const key of Object.keys(shapeOf(option))) {
      keys.add(key);
    }
  }
  return [...keys];
}

export function isFileSchema(schema: z.ZodType): boolean {
  const type = (schema as { def?: { type?: string } }).def?.type;
  return type === "instanceof" || type === "file" || type === "custom";
}

function stable(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stable(item)).join(",")}]`;
  }
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function fileBytes(input: FileInput): Uint8Array {
  return Buffer.from(input.contentBase64, "base64");
}

function canonicalField(schema: z.ZodType, value: unknown): unknown {
  if (!isFileSchema(schema)) {
    return value;
  }
  const file = fileInputSchema.parse(value);
  return {
    filename: file.filename,
    mimeType: file.mimeType,
    contentSha256: createHash("sha256").update(fileBytes(file)).digest("hex"),
  };
}

function section(schema: z.ZodType | undefined, args: Record<string, unknown>, multipart: boolean): Record<string, unknown> | undefined {
  if (!schema) {
    return undefined;
  }
  const out: Record<string, unknown> = {};
  for (const key of fieldKeys(schema)) {
    if (args[key] !== undefined) {
      const field = fieldSchema(schema, key);
      out[key] = multipart && field ? canonicalField(field, args[key]) : args[key];
    }
  }
  return out;
}

export function canonicalPayload(route: McpRoute, args: Record<string, unknown>): string {
  return stable({
    params: section(route.params, args, false),
    query: section(route.query, args, false),
    body: section(route.body, args, route.multipart),
  });
}

function picked(schema: z.ZodType | undefined, args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of fieldKeys(schema)) {
    if (args[key] !== undefined) {
      out[key] = args[key];
    }
  }
  return out;
}

function queryString(value: unknown): string {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value) ?? "";
}

function formValue(schema: z.ZodType, value: unknown): string | File {
  if (isFileSchema(schema)) {
    const file = fileInputSchema.parse(value);
    return new File([fileBytes(file)], file.filename, { type: file.mimeType || "application/octet-stream" });
  }
  return queryString(value);
}

export function routeRequest(route: McpRoute, args: Record<string, unknown>): Request {
  const params = picked(route.params, args);
  let path = route.path;
  for (const key of fieldKeys(route.params)) {
    const value = params[key];
    if (typeof value !== "string" && typeof value !== "number") {
      path = path.replace(`{${key}}`, "");
      continue;
    }
    path = path.replace(`{${key}}`, encodeURIComponent(String(value)));
  }
  const url = new URL(path, "http://localhost");
  for (const [key, value] of Object.entries(picked(route.query, args))) {
    if (Array.isArray(value)) {
      for (const item of value) {
        url.searchParams.append(key, queryString(item));
      }
    } else {
      url.searchParams.set(key, queryString(value));
    }
  }
  if (route.method === "get") {
    return new Request(url.toString(), { method: "GET" });
  }
  if (route.multipart) {
    const form = new FormData();
    for (const key of fieldKeys(route.body)) {
      const field = fieldSchema(route.body, key);
      if (args[key] !== undefined && field) {
        form.set(key, formValue(field, args[key]));
      }
    }
    return new Request(url.toString(), { method: route.method.toUpperCase(), body: form });
  }
  const body = picked(route.body, args);
  return new Request(url.toString(), {
    method: route.method.toUpperCase(),
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
