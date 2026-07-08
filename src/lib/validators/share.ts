// Zod schemas for share API inputs (system-prompt §5.3 sharing).
import { z } from "zod";

export const createShareSchema = z
  .object({
    fileId: z.uuid().optional(),
    folderId: z.uuid().optional(),
    expiresAt: z.coerce.date().optional(),
    password: z.string().min(1).max(200).optional(),
  })
  .refine((v) => Boolean(v.fileId) !== Boolean(v.folderId), {
    message: "Provide exactly one of fileId or folderId",
  });

export const verifyShareSchema = z.object({
  password: z.string().min(1),
});
