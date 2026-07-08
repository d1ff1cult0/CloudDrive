// Vault seed (system-prompt Phase 1):
//   - admin user (admin@example.com, role ADMIN)
//   - its whitelist entry
//   - default LOCAL storage backend "drive1"
// Idempotent (upserts) so `prisma db seed` can run repeatedly.
// Runs via `tsx prisma/seed.ts` (see package.json "prisma.seed").

import "dotenv/config";
import path from "node:path";
import fs from "node:fs";
import { hashPassword } from "better-auth/crypto";
import { Role, BackendType } from "../src/generated/prisma/client";
import { prisma } from "../src/lib/db";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@example.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "admin12345";

async function main() {
  // 1. Admin user (role ADMIN).
  const admin = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: { role: Role.ADMIN },
    create: {
      email: ADMIN_EMAIL,
      name: "Admin",
      role: Role.ADMIN,
      emailVerified: true,
    },
  });

  // 1b. Admin credential account so email+password login works. BetterAuth
  //     stores credentials as an Account with providerId "credential" and
  //     accountId = user id; hashPassword() matches BetterAuth's default verify.
  const passwordHash = await hashPassword(ADMIN_PASSWORD);
  const existingCred = await prisma.account.findFirst({
    where: { userId: admin.id, providerId: "credential" },
    select: { id: true },
  });
  if (existingCred) {
    await prisma.account.update({
      where: { id: existingCred.id },
      data: { password: passwordHash },
    });
  } else {
    await prisma.account.create({
      data: {
        userId: admin.id,
        accountId: admin.id,
        providerId: "credential",
        password: passwordHash,
      },
    });
  }

  // 2. Whitelist entry for the admin (signup = whitelist only, from Phase 5 on).
  await prisma.whitelistedEmail.upsert({
    where: { email: ADMIN_EMAIL },
    update: { addedById: admin.id },
    create: {
      email: ADMIN_EMAIL,
      note: "Seeded admin",
      addedById: admin.id,
    },
  });

  // 3. Default LOCAL backend "drive1".
  //    Production bind-mounts /mnt/drive1; dev uses ./data/drive1.
  const basePath =
    process.env.NODE_ENV === "production"
      ? "/mnt/drive1"
      : path.resolve(process.cwd(), "data", "drive1");
  fs.mkdirSync(basePath, { recursive: true });

  await prisma.storageBackend.upsert({
    where: { name: "drive1" },
    update: { isDefault: true, enabled: true, config: { basePath } },
    create: {
      name: "drive1",
      type: BackendType.LOCAL,
      enabled: true,
      isDefault: true,
      config: { basePath },
    },
  });

  console.log("Seed complete:");
  console.log(`  admin user    → ${ADMIN_EMAIL} (id ${admin.id}, role ADMIN)`);
  console.log(`  admin login   → ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  console.log(`  whitelist     → ${ADMIN_EMAIL}`);
  console.log(`  default drive → drive1 (LOCAL, basePath ${basePath})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
