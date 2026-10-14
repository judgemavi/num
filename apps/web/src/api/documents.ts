import { api } from "@/api/client";

/** The link that downloads a stored document. */
export function documentPath(id: string): string {
  return api.documents[":id"].$path({ param: { id } });
}
