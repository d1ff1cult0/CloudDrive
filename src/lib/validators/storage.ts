// Zod schemas for StorageBackend.config JSON (system-prompt §3 comments).
// The DB column is untyped Json; parse it through these before constructing a driver.
import { z } from "zod";

export const localConfigSchema = z.object({
  basePath: z.string().min(1),
});
export type LocalConfig = z.infer<typeof localConfigSchema>;

export const s3ConfigSchema = z.object({
  endpoint: z.url().optional(),
  region: z.string().min(1),
  bucket: z.string().min(1),
  accessKeyId: z.string().min(1),
  secretAccessKey: z.string().min(1),
  forcePathStyle: z.boolean().optional(),
});
export type S3Config = z.infer<typeof s3ConfigSchema>;
