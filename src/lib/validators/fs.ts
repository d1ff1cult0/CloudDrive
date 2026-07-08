// Zod schemas for folder/file API inputs (system-prompt §5.3).
import { z } from "zod";

export const createFolderSchema = z.object({
  name: z.string().min(1).max(255),
  parentId: z.uuid().nullable().optional(),
  storageBackendId: z.uuid().nullable().optional(),
});

export const updateFolderSchema = z
  .object({
    name: z.string().min(1).max(255).optional(),
    parentId: z.uuid().nullable().optional(),
    storageBackendId: z.uuid().nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "No changes provided",
  });

export const updateFileSchema = z
  .object({
    name: z.string().min(1).max(255).optional(),
    folderId: z.uuid().nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "No changes provided",
  });
