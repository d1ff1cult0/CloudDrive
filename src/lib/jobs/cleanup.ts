// Stale-upload GC (system-prompt §5.1). Aborts the physical upload and deletes
// the File row (cascade removes the UploadSession) for any session past its
// expiry. Invoked from the authenticated cron route POST /api/admin/gc.
import { prisma } from "@/lib/db";
import { getDriverForBackend } from "@/lib/storage/registry";

export async function cleanupStaleUploadSessions(
  now: Date = new Date(),
): Promise<{ removed: number }> {
  const stale = await prisma.uploadSession.findMany({
    where: { expiresAt: { lt: now } },
    include: { file: true },
  });

  for (const session of stale) {
    try {
      const driver = await getDriverForBackend(session.file.storageBackendId);
      await driver.abortUpload(
        session.file.storageKey,
        session.s3UploadId ?? undefined,
      );
    } catch {
      // best-effort: still remove the DB rows below
    }
    await prisma.file
      .delete({ where: { id: session.fileId } })
      .catch(() => {});
  }

  return { removed: stale.length };
}
