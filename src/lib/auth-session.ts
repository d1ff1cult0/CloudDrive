// Server-side session access (replaces the Phase 2-4 dev-auth shim).
// Routes call getCurrentUser(); it throws AuthError (401) when unauthenticated,
// which errorResponse() maps to a 401 JSON response.
import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { User } from "@/generated/prisma/client";

export class AuthError extends Error {
  constructor(
    readonly status = 401,
    readonly code = "UNAUTHORIZED",
    message = "Authentication required",
  ) {
    super(message);
    this.name = "AuthError";
  }
}

export async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}

/** The full User row for the current session, or throw AuthError. */
export async function getCurrentUser(): Promise<User> {
  const session = await getSession();
  if (!session?.user?.id) throw new AuthError();
  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) throw new AuthError();
  return user;
}

/** Like getCurrentUser but also requires the ADMIN role (403 otherwise). */
export async function requireAdmin(): Promise<User> {
  const user = await getCurrentUser();
  if (user.role !== "ADMIN") {
    throw new AuthError(403, "FORBIDDEN", "Admin access required");
  }
  return user;
}
