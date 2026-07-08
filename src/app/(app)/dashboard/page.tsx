// Minimal protected page for Phase 5 (auth verification). Phase 6 replaces this
// with the full file browser at /dashboard/[[...folderPath]].
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth-session";
import { LogoutButton } from "@/components/logout-button";

export const runtime = "nodejs";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session?.user) redirect("/login");

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-4 p-6">
      <h1 className="text-2xl font-semibold">Vault</h1>
      <p className="text-muted-foreground">
        Signed in as <strong>{session.user.email}</strong>
      </p>
      <div>
        <LogoutButton />
      </div>
    </main>
  );
}
