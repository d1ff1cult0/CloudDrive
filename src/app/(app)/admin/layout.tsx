import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth-session";

export const runtime = "nodejs";

// Admin-only gate for every /admin/* page. Chrome (sidebar) comes from (app)/layout.
export default async function AdminLayout({
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
  if (user.role !== "ADMIN") redirect("/dashboard");

  return <div className="mx-auto w-full max-w-5xl p-6">{children}</div>;
}
