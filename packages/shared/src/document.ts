import { z } from "zod";

export const documentSchema = z.object({
  id: z.uuid(),
  filename: z.string(),
  hash: z.string(),
  mimeType: z.string(),
  storagePath: z.string(),
  uploadedAt: z.string(),
  deletedAt: z.string().nullable(),
});

export type Document = z.infer<typeof documentSchema>;
