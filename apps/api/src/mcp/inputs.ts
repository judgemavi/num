import { z } from "zod";
import type { McpRoute } from "./catalog";

const fileInputSchema = z.union([
  z.object({
    filename: z.string().min(1),
    mimeType: z.string().optional(),
    text: z.string(),
  }),
  z.object({
    filename: z.string().min(1),
    mimeType: z.string().optional(),
    contentBase64: z.string(),
  }),
]);

export function isZodSchema(value: unknown): value is z.ZodType {
  return value instanceof z.ZodType;
}

export function shapeOf(schema: z.ZodType | undefined): Record<string, z.ZodType> {
  return schema instanceof z.ZodObject ? schema.shape : {};
}

function unionOptions(schema: z.ZodType | undefined): z.ZodType[] {
  return schema instanceof z.ZodUnion ? schema.options.filter(isZodSchema) : [];
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

/** `z.instanceof(File)` is a custom schema. */
export function isFileSchema(schema: z.ZodType): boolean {
  return schema instanceof z.ZodCustom || schema instanceof z.ZodFile;
}

function fileFrom(value: unknown) {
  const file = fileInputSchema.parse(value);
  if ("text" in file) {
    return new File([file.text], file.filename, { type: file.mimeType || "text/csv" });
  }
  return new File([Buffer.from(file.contentBase64, "base64")], file.filename, {
    type: file.mimeType || "application/octet-stream",
  });
}

function picked(schema: z.ZodType | undefined, args: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const key of fieldKeys(schema)) {
    if (args[key] !== undefined) {
      out[key] = args[key];
    }
  }
  return out;
}

function queryString(value: unknown) {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value) ?? "";
}

function formValue(schema: z.ZodType, value: unknown) {
  if (isFileSchema(schema)) {
    return fileFrom(value);
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
