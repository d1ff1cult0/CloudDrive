// Zod schemas for admin API inputs (system-prompt §5.3 admin section).
import { z } from "zod";

export const addWhitelistSchema = z.object({
  email: z.email().transform((e) => e.trim().toLowerCase()),
  note: z.string().max(500).optional(),
});

export const updateUserSchema = z
  .object({
    quotaBytes: z.coerce.bigint().refine((v) => v >= 0n).optional(),
    role: z.enum(["ADMIN", "USER"]).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "No changes provided" });

export const createBackendSchema = z.object({
  name: z.string().min(1).max(64),
  type: z.enum(["LOCAL", "S3"]),
  enabled: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  config: z.unknown(), // validated by type in the service
});

export const updateBackendSchema = z
  .object({
    name: z.string().min(1).max(64).optional(),
    enabled: z.boolean().optional(),
    isDefault: z.boolean().optional(),
    config: z.unknown().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "No changes provided" });

export const testBackendSchema = z.union([
  z.object({ backendId: z.uuid() }),
  z.object({ type: z.enum(["LOCAL", "S3"]), config: z.unknown() }),
]);
