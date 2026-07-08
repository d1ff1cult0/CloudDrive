import { FileBrowser } from "@/components/file-browser";

export const runtime = "nodejs";

// Optional catch-all: /dashboard = root, /dashboard/<folderId> = that folder.
// Auth is enforced by (app)/layout.tsx. Breadcrumbs come from the API.
export default async function DashboardPage({
  params,
}: {
  params: Promise<{ folderPath?: string[] }>;
}) {
  const { folderPath } = await params;
  const folderId = folderPath?.[folderPath.length - 1] ?? null;

  return <FileBrowser folderId={folderId} />;
}
