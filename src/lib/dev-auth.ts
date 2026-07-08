// TEMPORARY dev-auth shim (system-prompt §7): Phases 2-4 have no real auth yet,
// so routes get the "current user" from the seeded admin. Only active in
// non-production. Phase 5 deletes this file and wires BetterAuth sessions.
import { prisma } from "@/lib/db";
import type { User } from "@/generated/prisma/client";

export async function getCurrentUser(): Promise<User> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("dev-auth shim must never run in production");
  }
  const user = await prisma.user.findFirst({
    where: { role: "ADMIN" },
    orderBy: { createdAt: "asc" },
  });
  if (!user) {
    throw new Error("No seeded admin user found — run `pnpm prisma:seed`");
  }
  return user;
}
