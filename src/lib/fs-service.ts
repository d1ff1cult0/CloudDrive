// Folder/file service backing the file browser (system-prompt §5.3).
// All operations are owner-scoped; physical deletes go through the storage driver.
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/api/errors";
import type { File as FileRecord, User } from "@/generated/prisma/client";
import { getDriverForBackend } from "@/lib/storage/registry";

function sanitizeName(name: string): string {
  const cleaned = name.replace(/[/\\]/g, "_").replace(/\s+/g, " ").trim();
  if (!cleaned || cleaned === "." || cleaned === "..") return "untitled";
  return cleaned.slice(0, 255);
}

async function assertOwnedFolder(
  userId: string,
  folderId: string,
): Promise<void> {
  const folder = await prisma.folder.findUnique({
    where: { id: folderId },
    select: { ownerId: true },
  });
  if (!folder || folder.ownerId !== userId) {
    throw new AppError(404, "FOLDER_NOT_FOUND", "Folder not found");
  }
}

async function assertUsableBackend(backendId: string): Promise<void> {
  const backend = await prisma.storageBackend.findUnique({
    where: { id: backendId },
    select: { enabled: true },
  });
  if (!backend || !backend.enabled) {
    throw new AppError(400, "BACKEND_UNAVAILABLE", "Storage backend unavailable");
  }
}

// ---------- Listing ----------

export async function listFolder(user: User, folderId: string | null) {
  if (folderId) await assertOwnedFolder(user.id, folderId);

  const [current, folders, files, backends, freshUser] = await Promise.all([
    folderId
      ? prisma.folder.findUnique({
          where: { id: folderId },
          select: { id: true, name: true, parentId: true },
        })
      : Promise.resolve(null),
    prisma.folder.findMany({
      where: { ownerId: user.id, parentId: folderId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, createdAt: true, storageBackendId: true },
    }),
    prisma.file.findMany({
      where: { ownerId: user.id, folderId, status: "READY" },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        sizeBytes: true,
        mimeType: true,
        createdAt: true,
      },
    }),
    prisma.storageBackend.findMany({
      where: { enabled: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, type: true, isDefault: true },
    }),
    prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { usedBytes: true, quotaBytes: true },
    }),
  ]);

  // Build breadcrumb chain (root → current), excluding the virtual root.
  const breadcrumbs: { id: string; name: string }[] = [];
  let cursor = current?.parentId ?? null;
  const seen = new Set<string>();
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    const anc = await prisma.folder.findUnique({
      where: { id: cursor },
      select: { id: true, name: true, parentId: true },
    });
    if (!anc) break;
    breadcrumbs.unshift({ id: anc.id, name: anc.name });
    cursor = anc.parentId;
  }
  if (current) breadcrumbs.push({ id: current.id, name: current.name });

  return {
    folder: current ? { id: current.id, name: current.name } : null,
    breadcrumbs,
    folders: folders.map((f) => ({
      id: f.id,
      name: f.name,
      createdAt: f.createdAt.toISOString(),
      storageBackendId: f.storageBackendId,
    })),
    files: files.map((f) => ({
      id: f.id,
      name: f.name,
      sizeBytes: f.sizeBytes.toString(),
      mimeType: f.mimeType,
      createdAt: f.createdAt.toISOString(),
    })),
    quota: {
      usedBytes: freshUser.usedBytes.toString(),
      quotaBytes: freshUser.quotaBytes.toString(),
    },
    backends: backends.map((b) => ({
      id: b.id,
      name: b.name,
      type: b.type,
      isDefault: b.isDefault,
    })),
  };
}

// ---------- Folders ----------

export async function createFolder(
  user: User,
  input: { name: string; parentId?: string | null; storageBackendId?: string | null },
) {
  const parentId = input.parentId ?? null;
  if (parentId) await assertOwnedFolder(user.id, parentId);
  if (input.storageBackendId) await assertUsableBackend(input.storageBackendId);

  const name = sanitizeName(input.name);
  const clash = await prisma.folder.findFirst({
    where: { ownerId: user.id, parentId, name },
    select: { id: true },
  });
  if (clash) {
    throw new AppError(409, "NAME_TAKEN", "A folder with that name already exists");
  }

  return prisma.folder.create({
    data: {
      name,
      parentId,
      ownerId: user.id,
      storageBackendId: input.storageBackendId ?? null,
    },
    select: { id: true, name: true },
  });
}

/** Is `candidateAncestorId` an ancestor of (or equal to) `folderId`? */
async function isAncestorOrSelf(
  candidateAncestorId: string,
  folderId: string,
): Promise<boolean> {
  let cursor: string | null = folderId;
  const seen = new Set<string>();
  while (cursor && !seen.has(cursor)) {
    if (cursor === candidateAncestorId) return true;
    seen.add(cursor);
    const f: { parentId: string | null } | null =
      await prisma.folder.findUnique({
        where: { id: cursor },
        select: { parentId: true },
      });
    cursor = f?.parentId ?? null;
  }
  return false;
}

export async function updateFolder(
  user: User,
  id: string,
  input: { name?: string; parentId?: string | null; storageBackendId?: string | null },
) {
  await assertOwnedFolder(user.id, id);

  const data: {
    name?: string;
    parentId?: string | null;
    storageBackendId?: string | null;
  } = {};

  if (input.parentId !== undefined) {
    const newParent = input.parentId;
    if (newParent) {
      await assertOwnedFolder(user.id, newParent);
      // Prevent moving a folder into itself or one of its descendants.
      if (newParent === id || (await isAncestorOrSelf(id, newParent))) {
        throw new AppError(400, "INVALID_MOVE", "Cannot move a folder into itself");
      }
    }
    data.parentId = newParent;
  }
  if (input.storageBackendId !== undefined) {
    if (input.storageBackendId) await assertUsableBackend(input.storageBackendId);
    data.storageBackendId = input.storageBackendId;
  }
  if (input.name !== undefined) data.name = sanitizeName(input.name);

  // Enforce (owner, parent, name) uniqueness in the destination.
  const targetParent = data.parentId ?? (await currentParent(id));
  const targetName = data.name ?? (await currentName(id));
  const clash = await prisma.folder.findFirst({
    where: {
      ownerId: user.id,
      parentId: targetParent,
      name: targetName,
      id: { not: id },
    },
    select: { id: true },
  });
  if (clash) {
    throw new AppError(409, "NAME_TAKEN", "A folder with that name already exists");
  }

  return prisma.folder.update({
    where: { id },
    data,
    select: { id: true, name: true },
  });
}

async function currentParent(id: string): Promise<string | null> {
  const f = await prisma.folder.findUnique({
    where: { id },
    select: { parentId: true },
  });
  return f?.parentId ?? null;
}
async function currentName(id: string): Promise<string> {
  const f = await prisma.folder.findUniqueOrThrow({
    where: { id },
    select: { name: true },
  });
  return f.name;
}

async function collectSubtreeFiles(rootId: string): Promise<FileRecord[]> {
  const all: FileRecord[] = [];
  let frontier = [rootId];
  while (frontier.length > 0) {
    const files = await prisma.file.findMany({
      where: { folderId: { in: frontier } },
    });
    all.push(...files);
    const children = await prisma.folder.findMany({
      where: { parentId: { in: frontier } },
      select: { id: true },
    });
    frontier = children.map((c) => c.id);
  }
  return all;
}

export async function deleteFolder(user: User, id: string): Promise<void> {
  await assertOwnedFolder(user.id, id);

  const files = await collectSubtreeFiles(id);

  // Remove physical objects and tally reclaimed quota (only READY files count).
  let reclaimed = 0n;
  for (const file of files) {
    try {
      const driver = await getDriverForBackend(file.storageBackendId);
      if (file.status === "READY") {
        await driver.delete(file.storageKey);
        reclaimed += file.sizeBytes;
      } else {
        await driver.abortUpload(file.storageKey);
      }
    } catch {
      // best-effort physical cleanup
    }
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { usedBytes: { decrement: reclaimed } },
    }),
    // Cascade removes descendant folders, files, and upload sessions.
    prisma.folder.delete({ where: { id } }),
  ]);
}

// ---------- Files ----------

export async function updateFile(
  user: User,
  id: string,
  input: { name?: string; folderId?: string | null },
) {
  const file = await prisma.file.findUnique({ where: { id } });
  if (!file || file.ownerId !== user.id) {
    throw new AppError(404, "FILE_NOT_FOUND", "File not found");
  }

  const data: { name?: string; folderId?: string | null } = {};
  if (input.folderId !== undefined) {
    if (input.folderId) await assertOwnedFolder(user.id, input.folderId);
    data.folderId = input.folderId;
  }
  if (input.name !== undefined) data.name = sanitizeName(input.name);

  const targetFolder = data.folderId ?? file.folderId;
  const targetName = data.name ?? file.name;
  const clash = await prisma.file.findFirst({
    where: {
      ownerId: user.id,
      folderId: targetFolder,
      name: targetName,
      id: { not: id },
    },
    select: { id: true },
  });
  if (clash) {
    throw new AppError(409, "NAME_TAKEN", "A file with that name already exists");
  }

  return prisma.file.update({
    where: { id },
    data,
    select: { id: true, name: true },
  });
}

export async function deleteFile(user: User, id: string): Promise<void> {
  const file = await prisma.file.findUnique({ where: { id } });
  if (!file || file.ownerId !== user.id) {
    throw new AppError(404, "FILE_NOT_FOUND", "File not found");
  }

  try {
    const driver = await getDriverForBackend(file.storageBackendId);
    if (file.status === "READY") {
      await driver.delete(file.storageKey);
    } else {
      await driver.abortUpload(file.storageKey);
    }
  } catch {
    // best-effort physical cleanup
  }

  const reclaimed = file.status === "READY" ? file.sizeBytes : 0n;
  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { usedBytes: { decrement: reclaimed } },
    }),
    prisma.file.delete({ where: { id } }),
  ]);
}
