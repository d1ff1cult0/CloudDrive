// BetterAuth server instance (system-prompt §7 Phase 5).
// Email+password with the Prisma adapter. A before-create database hook enforces
// the signup whitelist: emails not in WhitelistedEmail are rejected.
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";

import { prisma } from "@/lib/db";

export const auth = betterAuth({
  baseURL: process.env.APP_URL ?? process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    // Self-hosted: no email verification step.
    requireEmailVerification: false,
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          // Bootstrap: the very first account to register is allowed through
          // (and promoted to ADMIN in the after-hook), regardless of whitelist.
          const userCount = await prisma.user.count();
          if (userCount === 0) return { data: user };

          const email = user.email?.trim();
          const allowed = email
            ? await prisma.whitelistedEmail.findFirst({
                where: { email: { equals: email, mode: "insensitive" } },
                select: { id: true },
              })
            : null;
          if (!allowed) {
            throw new APIError("FORBIDDEN", {
              message:
                "This email is not approved for signup. Ask an administrator to whitelist it.",
            });
          }
          return { data: user };
        },
        after: async (user) => {
          // If this is the only user, they are the founding admin.
          const userCount = await prisma.user.count();
          if (userCount === 1) {
            await prisma.user.update({
              where: { id: user.id },
              data: { role: "ADMIN", emailVerified: true },
            });
            await prisma.whitelistedEmail
              .upsert({
                where: { email: user.email },
                update: {},
                create: { email: user.email, note: "First user (admin)" },
              })
              .catch(() => {});
          }
        },
      },
    },
  },
  // Must be last: lets BetterAuth set cookies from Next.js server actions.
  plugins: [nextCookies()],
});
