import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth-session";
import { FileBrowser } from "@/components/file-browser";

export const runtime = "nodejs";

// Optional catch-all: /dashboard = root, /dashboard/<folderId> = that folder.
// Navigation pushes a single folderId segment; breadcrumbs come from the API.
export default async function DashboardPage({
  params,
}: {
  params: Promise<{ folderPath?: string[] }>;
}) {
  const session = await getSession();
  if (!session?.user) redirect("/login");

  const { folderPath } = await params;
  const folderId = folderPath?.[folderPath.length - 1] ?? null;

  return <FileBrowser folderId={folderId} />;
}
