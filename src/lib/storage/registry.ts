// Storage driver registry (system-prompt §4).
//   getDriverForBackend(id)        → constructs (and caches) the driver for a backend row
//   resolveBackendForFolder(id)    → nearest backend up the folder tree, else the default
import { prisma } from "@/lib/db";
import type { BackendType, StorageBackend } from "@/generated/prisma/client";
import { localConfigSchema, s3ConfigSchema } from "@/lib/validators/storage";
import type { StorageDriver } from "./driver";
import { createLocalStorageDriver } from "./local";
import { createS3StorageDriver } from "./s3";

// Driver instances are cheap to reuse and hold connection state (S3Client), so
// cache them by backend id for the process lifetime.
const driverCache = new Map<string, StorageDriver>();

function buildDriver(type: BackendType, config: unknown): StorageDriver {
  switch (type) {
    case "LOCAL": {
      const { basePath } = localConfigSchema.parse(config);
      return createLocalStorageDriver(basePath);
    }
    case "S3": {
      const parsed = s3ConfigSchema.parse(config);
      return createS3StorageDriver(parsed);
    }
    default: {
      // Exhaustiveness guard — a new BackendType must be handled here.
      const _never: never = type;
      throw new Error(`Unsupported backend type: ${String(_never)}`);
    }
  }
}

export async function getDriverForBackend(
  backendId: string,
): Promise<StorageDriver> {
  const cached = driverCache.get(backendId);
  if (cached) return cached;

  const backend = await prisma.storageBackend.findUnique({
    where: { id: backendId },
  });
  if (!backend) {
    throw new Error(`Storage backend not found: ${backendId}`);
  }
  const driver = buildDriver(backend.type, backend.config);
  driverCache.set(backendId, driver);
  return driver;
}

/** Invalidate a cached driver (e.g. after an admin edits backend config). */
export function invalidateDriverCache(backendId?: string): void {
  if (backendId) driverCache.delete(backendId);
  else driverCache.clear();
}

/**
 * Resolve which backend a new file in `folderId` should live on:
 * walk up the folder tree for the nearest folder with an explicit
 * storageBackendId; if none, fall back to the default backend.
 */
export async function resolveBackendForFolder(
  folderId: string | null,
): Promise<StorageBackend> {
  let currentId = folderId;
  // Guard against pathological cycles (shouldn't happen with tree constraints).
  const visited = new Set<string>();

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const folder = await prisma.folder.findUnique({
      where: { id: currentId },
      select: { parentId: true, storageBackendId: true },
    });
    if (!folder) break;

    if (folder.storageBackendId) {
      const backend = await prisma.storageBackend.findUnique({
        where: { id: folder.storageBackendId },
      });
      if (backend && backend.enabled) return backend;
      // Backend missing or disabled → keep walking up toward the default.
    }
    currentId = folder.parentId;
  }

  const def = await prisma.storageBackend.findFirst({
    where: { isDefault: true, enabled: true },
  });
  if (!def) {
    throw new Error("No enabled default storage backend is configured");
  }
  return def;
}
