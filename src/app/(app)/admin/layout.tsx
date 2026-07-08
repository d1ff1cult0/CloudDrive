import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth-session";
import { ThemeToggle } from "@/components/theme-toggle";

export const runtime = "nodejs";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Admin-only gate for every /admin/* page.
  let user;
  try {
    user = await getCurrentUser();
  } catch {
    redirect("/login");
  }
  if (user.role !== "ADMIN") redirect("/dashboard");

  return (
    <div className="mx-auto w-full max-w-5xl p-4 sm:p-6">
      <header className="mb-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-semibold">Vault Admin</h1>
          <nav className="text-muted-foreground flex gap-3 text-sm">
            <Link href="/admin/whitelist" className="hover:text-foreground">
              Whitelist
            </Link>
            <Link href="/admin/users" className="hover:text-foreground">
              Users
            </Link>
            <Link href="/admin/backends" className="hover:text-foreground">
              Backends
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/dashboard" className="text-sm underline">
            ← Files
          </Link>
          <ThemeToggle />
        </div>
      </header>
      {children}
    </div>
  );
}
