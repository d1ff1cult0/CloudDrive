// Public share service (system-prompt Phase 8). Share links point at either a
// file or a folder; folder shares expose a read-only view of the subtree, with
// strict containment checks so a requested file/folder can never escape it.
import { createHmac } from "node:crypto";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import { nanoid } from "nanoid";

import { prisma } from "@/lib/db";
import { AppError } from "@/lib/api/errors";
import type { ShareLink, User } from "@/generated/prisma/client";

const SECRET = process.env.BETTER_AUTH_SECRET ?? "insecure-dev-secret";

export function shareCookieName(token: string): string {
  return `vault-share-${token}`;
}

/** HMAC binding the unlock cookie to this share + its current password hash. */
export function shareCookieValue(share: ShareLink): string {
  return createHmac("sha256", SECRET)
    .update(`${share.id}:${share.passwordHash ?? ""}`)
    .digest("hex");
}

export function isExpired(share: ShareLink, now = new Date()): boolean {
  return share.expiresAt !== null && share.expiresAt.getTime() < now.getTime();
}

export function isUnlocked(share: ShareLink, cookieValue: string | undefined): boolean {
  if (!share.passwordHash) return true;
  return cookieValue === shareCookieValue(share);
}

// ---------- Owner operations ----------

export async function createShare(
  user: User,
  input: {
    fileId?: string;
    folderId?: string;
    expiresAt?: Date;
    password?: string;
  },
) {
  if (input.fileId) {
    const file = await prisma.file.findUnique({ where: { id: input.fileId } });
    if (!file || file.ownerId !== user.id) {
      throw new AppError(404, "FILE_NOT_FOUND", "File not found");
    }
    if (file.status !== "READY") {
      throw new AppError(409, "NOT_READY", "File is not ready to share");
    }
  } else if (input.folderId) {
    const folder = await prisma.folder.findUnique({ where: { id: input.folderId } });
    if (!folder || folder.ownerId !== user.id) {
      throw new AppError(404, "FOLDER_NOT_FOUND", "Folder not found");
    }
  }

  const token = nanoid(21);
  const passwordHash = input.password ? await hashPassword(input.password) : null;

  const share = await prisma.shareLink.create({
    data: {
      token,
      fileId: input.fileId ?? null,
      folderId: input.folderId ?? null,
      createdById: user.id,
      passwordHash,
      expiresAt: input.expiresAt ?? null,
    },
  });
  return {
    id: share.id,
    token: share.token,
    url: `${process.env.APP_URL ?? ""}/s/${share.token}`,
  };
}

export async function listSharesForItem(
  user: User,
  where: { fileId?: string; folderId?: string },
) {
  const shares = await prisma.shareLink.findMany({
    where: {
      createdById: user.id,
      fileId: where.fileId ?? undefined,
      folderId: where.folderId ?? undefined,
    },
    orderBy: { createdAt: "desc" },
  });
  return shares.map((s) => ({
    id: s.id,
    token: s.token,
    url: `${process.env.APP_URL ?? ""}/s/${s.token}`,
    hasPassword: s.passwordHash !== null,
    expiresAt: s.expiresAt?.toISOString() ?? null,
    downloadCount: s.downloadCount,
    createdAt: s.createdAt.toISOString(),
  }));
}

export async function deleteShare(user: User, id: string): Promise<void> {
  const share = await prisma.shareLink.findUnique({ where: { id } });
  if (!share || share.createdById !== user.id) {
    throw new AppError(404, "NOT_FOUND", "Share not found");
  }
  await prisma.shareLink.delete({ where: { id } });
}

// ---------- Public access ----------

export async function getShareByToken(token: string): Promise<ShareLink> {
  const share = await prisma.shareLink.findUnique({ where: { token } });
  if (!share) throw new AppError(404, "NOT_FOUND", "Share link not found");
  if (isExpired(share)) throw new AppError(410, "EXPIRED", "Share link has expired");
  return share;
}

export async function verifySharePassword(
  token: string,
  password: string,
): Promise<ShareLink> {
  const share = await getShareByToken(token);
  if (!share.passwordHash) return share; // nothing to verify
  const ok = await verifyPassword({ hash: share.passwordHash, password });
  if (!ok) throw new AppError(401, "WRONG_PASSWORD", "Incorrect password");
  return share;
}

/** Walk up from folderId; true if rootId is an ancestor of (or equals) it. */
async function isFolderInSubtree(rootId: string, folderId: string): Promise<boolean> {
  let cursor: string | null = folderId;
  const seen = new Set<string>();
  while (cursor && !seen.has(cursor)) {
    if (cursor === rootId) return true;
    seen.add(cursor);
    const f: { parentId: string | null } | null = await prisma.folder.findUnique({
      where: { id: cursor },
      select: { parentId: true },
    });
    cursor = f?.parentId ?? null;
  }
  return false;
}

/**
 * Public metadata for a share. For folder shares, `folderId` navigates within
 * the subtree (defaults to the shared root); it is rejected if it escapes.
 */
export async function getShareContents(share: ShareLink, folderId?: string | null) {
  if (share.fileId) {
    const file = await prisma.file.findUnique({ where: { id: share.fileId } });
    if (!file || file.status !== "READY") {
      throw new AppError(404, "NOT_FOUND", "Shared file not found");
    }
    return {
      type: "file" as const,
      name: file.name,
      sizeBytes: file.sizeBytes.toString(),
      mimeType: file.mimeType,
    };
  }

  // Folder share.
  const rootId = share.folderId!;
  const root = await prisma.folder.findUnique({
    where: { id: rootId },
    select: { id: true, name: true },
  });
  if (!root) throw new AppError(404, "NOT_FOUND", "Shared folder not found");

  const targetId = folderId ?? rootId;
  if (targetId !== rootId && !(await isFolderInSubtree(rootId, targetId))) {
    throw new AppError(403, "OUT_OF_SCOPE", "Path is outside the shared folder");
  }

  const [current, folders, files] = await Promise.all([
    prisma.folder.findUnique({
      where: { id: targetId },
      select: { id: true, name: true },
    }),
    prisma.folder.findMany({
      where: { parentId: targetId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.file.findMany({
      where: { folderId: targetId, status: "READY" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, sizeBytes: true, mimeType: true },
    }),
  ]);

  // Breadcrumbs from the shared root down to the current folder.
  const crumbs: { id: string; name: string }[] = [];
  let cursor: string | null = targetId;
  const seen = new Set<string>();
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    const f: { id: string; name: string; parentId: string | null } | null =
      await prisma.folder.findUnique({
        where: { id: cursor },
        select: { id: true, name: true, parentId: true },
      });
    if (!f) break;
    crumbs.unshift({ id: f.id, name: f.name });
    if (f.id === rootId) break;
    cursor = f.parentId;
  }

  return {
    type: "folder" as const,
    rootId,
    rootName: root.name,
    current: current ? { id: current.id, name: current.name } : null,
    breadcrumbs: crumbs,
    folders,
    files: files.map((f) => ({
      id: f.id,
      name: f.name,
      sizeBytes: f.sizeBytes.toString(),
      mimeType: f.mimeType,
    })),
  };
}

/** Resolve a downloadable file for a share, enforcing subtree containment. */
export async function resolveShareFile(share: ShareLink, fileId?: string | null) {
  if (share.fileId) {
    // File share: only the shared file is downloadable.
    if (fileId && fileId !== share.fileId) {
      throw new AppError(403, "OUT_OF_SCOPE", "File is outside this share");
    }
    const file = await prisma.file.findUnique({ where: { id: share.fileId } });
    if (!file || file.status !== "READY") {
      throw new AppError(404, "NOT_FOUND", "Shared file not found");
    }
    return file;
  }

  // Folder share: fileId required and must live inside the subtree.
  if (!fileId) throw new AppError(400, "BAD_REQUEST", "fileId is required");
  const file = await prisma.file.findUnique({ where: { id: fileId } });
  if (!file || file.status !== "READY" || !file.folderId) {
    throw new AppError(404, "NOT_FOUND", "File not found");
  }
  if (!(await isFolderInSubtree(share.folderId!, file.folderId))) {
    throw new AppError(403, "OUT_OF_SCOPE", "File is outside the shared folder");
  }
  return file;
}

export async function incrementDownloadCount(shareId: string): Promise<void> {
  await prisma.shareLink
    .update({ where: { id: shareId }, data: { downloadCount: { increment: 1 } } })
    .catch(() => {});
}
