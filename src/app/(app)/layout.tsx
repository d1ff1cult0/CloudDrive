import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth-session";
import { Sidebar } from "@/components/sidebar";

export const runtime = "nodejs";

// Shared app shell: persistent sidebar + content column. Re-renders (and so the
// storage bar updates) whenever a page calls router.refresh() after a change.
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let user;
  try {
    user = await getCurrentUser();
  } catch {
    redirect("/login");
  }

  return (
    <div className="bg-background flex min-h-screen">
      <Sidebar
        email={user.email}
        isAdmin={user.role === "ADMIN"}
        usedBytes={Number(user.usedBytes)}
        quotaBytes={Number(user.quotaBytes)}
      />
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
