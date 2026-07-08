// Zod schemas for upload API inputs (system-prompt §5.1).
import { z } from "zod";

export const initUploadSchema = z.object({
  fileName: z.string().min(1).max(255),
  // JSON carries the size as a number (or numeric string); store as BigInt.
  sizeBytes: z.coerce
    .bigint()
    .refine((v) => v >= 0n, { message: "sizeBytes must be non-negative" }),
  mimeType: z.string().min(1).default("application/octet-stream"),
  folderId: z.uuid().nullable().optional(),
});
export type InitUploadInput = z.infer<typeof initUploadSchema>;

export const completeUploadSchema = z.object({
  sessionId: z.uuid(),
});
