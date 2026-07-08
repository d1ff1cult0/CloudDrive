// Vault seed. Ensures a default LOCAL storage backend exists. There is NO admin
// seeding — the first account to register becomes the admin (see lib/auth.ts).
// Idempotent: an existing "drive1" is left untouched so admin edits are preserved.
// Runs via `tsx prisma/seed.ts` (see prisma.config.ts migrations.seed).
import "dotenv/config";
import path from "node:path";
import { BackendType } from "../src/generated/prisma/client";
import { prisma } from "../src/lib/db";

async function main() {
  // Single knob for local storage location. In Docker this is /data/storage
  // (bind-mounted to the host STORAGE_PATH); in dev it falls back to ./data/drive1.
  const basePath =
    process.env.STORAGE_PATH ?? path.resolve(process.cwd(), "data", "drive1");

  await prisma.storageBackend.upsert({
    where: { name: "drive1" },
    update: {}, // preserve any admin changes on re-deploy
    create: {
      name: "drive1",
      type: BackendType.LOCAL,
      enabled: true,
      isDefault: true,
      config: { basePath },
    },
  });

  console.log(`Seed complete: default backend drive1 (LOCAL, basePath ${basePath})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
