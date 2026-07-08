// Admin operations (system-prompt Phase 7): whitelist, users, storage backends.
// Enforces the exactly-one-default-backend invariant in the service layer.
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";

import { prisma } from "@/lib/db";
import { AppError } from "@/lib/api/errors";
import type { BackendType, Prisma } from "@/generated/prisma/client";
import { createLocalStorageDriver } from "@/lib/storage/local";
import {
  createS3StorageDriver,
  type S3BackendConfig,
} from "@/lib/storage/s3";
import type { StorageDriver } from "@/lib/storage/driver";
import { invalidateDriverCache } from "@/lib/storage/registry";
import { localConfigSchema, s3ConfigSchema } from "@/lib/validators/storage";

// ---------- Whitelist ----------

export function listWhitelist() {
  return prisma.whitelistedEmail.findMany({ orderBy: { createdAt: "desc" } });
}

export async function addWhitelist(
  adminId: string,
  input: { email: string; note?: string },
) {
  const existing = await prisma.whitelistedEmail.findFirst({
    where: { email: { equals: input.email, mode: "insensitive" } },
    select: { id: true },
  });
  if (existing) throw new AppError(409, "ALREADY_WHITELISTED", "Email already whitelisted");
  return prisma.whitelistedEmail.create({
    data: { email: input.email, note: input.note, addedById: adminId },
  });
}

export async function removeWhitelist(id: string) {
  try {
    await prisma.whitelistedEmail.delete({ where: { id } });
  } catch {
    throw new AppError(404, "NOT_FOUND", "Whitelist entry not found");
  }
}

// ---------- Users ----------

export async function listUsers() {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      quotaBytes: true,
      usedBytes: true,
      createdAt: true,
    },
  });
  return users.map((u) => ({
    ...u,
    quotaBytes: u.quotaBytes.toString(),
    usedBytes: u.usedBytes.toString(),
    createdAt: u.createdAt.toISOString(),
  }));
}

export async function updateUser(
  id: string,
  input: { quotaBytes?: bigint; role?: "ADMIN" | "USER" },
) {
  const user = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!user) throw new AppError(404, "NOT_FOUND", "User not found");
  const updated = await prisma.user.update({
    where: { id },
    data: {
      ...(input.quotaBytes !== undefined ? { quotaBytes: input.quotaBytes } : {}),
      ...(input.role !== undefined ? { role: input.role } : {}),
    },
    select: { id: true, role: true, quotaBytes: true },
  });
  return { id: updated.id, role: updated.role, quotaBytes: updated.quotaBytes.toString() };
}

// ---------- Backends ----------

function redactConfig(type: BackendType, config: unknown) {
  if (type === "S3" && config && typeof config === "object") {
    const c = config as Record<string, unknown>;
    return { ...c, secretAccessKey: c.secretAccessKey ? "********" : "" };
  }
  return config;
}

export async function listBackends() {
  const backends = await prisma.storageBackend.findMany({
    orderBy: { name: "asc" },
  });
  return backends.map((b) => ({
    id: b.id,
    name: b.name,
    type: b.type,
    enabled: b.enabled,
    isDefault: b.isDefault,
    config: redactConfig(b.type, b.config),
    createdAt: b.createdAt.toISOString(),
  }));
}

function validateConfig(type: BackendType, config: unknown): Prisma.InputJsonValue {
  if (type === "LOCAL") return localConfigSchema.parse(config) as Prisma.InputJsonValue;
  return s3ConfigSchema.parse(config) as Prisma.InputJsonValue;
}

export async function createBackend(input: {
  name: string;
  type: BackendType;
  enabled?: boolean;
  isDefault?: boolean;
  config: unknown;
}) {
  const config = validateConfig(input.type, input.config);
  const makeDefault = input.isDefault ?? false;
  try {
    return await prisma.$transaction(async (tx) => {
      if (makeDefault) {
        await tx.storageBackend.updateMany({
          where: { isDefault: true },
          data: { isDefault: false },
        });
      }
      const created = await tx.storageBackend.create({
        data: {
          name: input.name,
          type: input.type,
          enabled: input.enabled ?? true,
          isDefault: makeDefault,
          config,
        },
      });
      // Guarantee at least one default exists.
      const defaults = await tx.storageBackend.count({ where: { isDefault: true } });
      if (defaults === 0) {
        await tx.storageBackend.update({
          where: { id: created.id },
          data: { isDefault: true },
        });
      }
      return created;
    });
  } catch (e) {
    if (isUniqueViolation(e)) {
      throw new AppError(409, "NAME_TAKEN", "A backend with that name already exists");
    }
    throw e;
  }
}

export async function updateBackend(
  id: string,
  input: {
    name?: string;
    enabled?: boolean;
    isDefault?: boolean;
    config?: unknown;
  },
) {
  const current = await prisma.storageBackend.findUnique({ where: { id } });
  if (!current) throw new AppError(404, "NOT_FOUND", "Backend not found");

  const data: Prisma.StorageBackendUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.enabled !== undefined) data.enabled = input.enabled;

  if (input.config !== undefined) {
    let cfg = input.config;
    // For S3, an empty secret means "keep the existing one".
    if (current.type === "S3" && cfg && typeof cfg === "object") {
      const c = cfg as Record<string, unknown>;
      if (!c.secretAccessKey) {
        const existing = current.config as Record<string, unknown>;
        cfg = { ...c, secretAccessKey: existing.secretAccessKey };
      }
    }
    data.config = validateConfig(current.type, cfg);
  }

  // Default handling: can only turn default ON (set another as default instead).
  if (input.isDefault === true) {
    data.isDefault = true;
  } else if (input.isDefault === false && current.isDefault) {
    throw new AppError(
      400,
      "DEFAULT_REQUIRED",
      "Set another backend as default instead of unsetting this one",
    );
  }

  try {
    await prisma.$transaction(async (tx) => {
      if (input.isDefault === true) {
        await tx.storageBackend.updateMany({
          where: { isDefault: true, id: { not: id } },
          data: { isDefault: false },
        });
      }
      await tx.storageBackend.update({ where: { id }, data });
    });
  } catch (e) {
    if (isUniqueViolation(e)) {
      throw new AppError(409, "NAME_TAKEN", "A backend with that name already exists");
    }
    throw e;
  }

  // Config/enabled may have changed → drop any cached driver.
  invalidateDriverCache(id);
  return { id };
}

function buildDriver(type: BackendType, config: unknown): StorageDriver {
  if (type === "LOCAL") {
    const { basePath } = localConfigSchema.parse(config);
    return createLocalStorageDriver(basePath);
  }
  const parsed = s3ConfigSchema.parse(config) as S3BackendConfig;
  return createS3StorageDriver(parsed);
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
  return Buffer.concat(chunks);
}

/** Write → read → delete a probe object to verify the backend works. */
export async function testBackend(
  input:
    | { backendId: string }
    | { type: BackendType; config: unknown },
): Promise<{ ok: true }> {
  let type: BackendType;
  let config: unknown;
  if ("backendId" in input) {
    const b = await prisma.storageBackend.findUnique({ where: { id: input.backendId } });
    if (!b) throw new AppError(404, "NOT_FOUND", "Backend not found");
    type = b.type;
    config = b.config;
  } else {
    type = input.type;
    config = input.config;
  }

  let driver: StorageDriver;
  try {
    driver = buildDriver(type, config);
  } catch {
    throw new AppError(400, "INVALID_CONFIG", "Invalid backend configuration");
  }

  const key = `.vault-probe/${randomUUID()}`;
  const payload = Buffer.from("vault-connection-probe");
  try {
    const init = await driver.initUpload(key, payload.length, "application/octet-stream");
    const w = await driver.writeChunk({
      key,
      chunkIndex: 0,
      chunkStream: Readable.from(payload),
      chunkLength: payload.length,
      externalUploadId: init.externalUploadId,
    });
    await driver.completeUpload({
      key,
      externalUploadId: init.externalUploadId,
      parts: w.eTag ? [{ partNumber: 1, eTag: w.eTag }] : undefined,
    });
    const got = await streamToBuffer(await driver.readRange({ key }));
    const stat = await driver.stat(key);
    await driver.delete(key);
    if (!got.equals(payload) || !stat || stat.sizeBytes !== payload.length) {
      throw new Error("probe mismatch");
    }
  } catch (e) {
    // Best-effort cleanup, then report.
    await driver.delete(key).catch(() => {});
    throw new AppError(
      400,
      "CONNECTION_FAILED",
      `Backend test failed: ${(e as Error).message}`,
    );
  }
  return { ok: true };
}

function isUniqueViolation(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    (e as { code?: string }).code === "P2002"
  );
}
