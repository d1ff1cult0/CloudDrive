# Vault — self-hosted cloud storage

A multi-user, self-hosted cloud storage app (Google Drive style) designed to run
behind a **Cloudflare Tunnel**. It supports **multiple local drives** and
**optional S3-compatible backends** (MinIO, Hetzner, AWS) through one unified
interface, with an **admin-controlled signup whitelist**, **per-user quotas**,
**per-folder backend targeting**, and **public share links** for files & folders.

Uploads are chunked (50 MiB) and downloads use HTTP Range requests, so it works
within Cloudflare's 100 MB request / ~100 s response limits and both are
resumable. Files are always streamed — never buffered in memory.

---

## Quick start (Docker)

You need Docker with the Compose plugin. From a clean clone:

```bash
# 1. (optional) choose where your files live on the host
cp .env.example .env
#    then edit STORAGE_PATH, e.g. STORAGE_PATH=/mnt/ext_storage
#    (if you skip this, files go to ./storage next to the compose file)

# 2. start everything
docker compose up -d

# 3. open the app
open http://localhost:3033
```

**The first account you register becomes the administrator.** After that, signups
are restricted to emails an admin has added to the whitelist.

That's it. The database, auth secret, schema migrations, and the default storage
backend are all configured automatically. The only thing most people set is
`STORAGE_PATH`.

### What each piece does
- **postgres** — the database (data persisted in a Docker volume).
- **migrate** — a one-shot container that applies DB migrations and seeds the
  default `drive1` backend pointing at your `STORAGE_PATH`, then exits.
- **app** — the Next.js server on port **3033**. Runs as a non-root user; on
  first start it generates and persists a random auth secret if you didn't set one.

---

## Configuration

Only these environment variables matter for a normal install (see `.env.example`):

| Variable | Default | Purpose |
|---|---|---|
| `STORAGE_PATH` | `./storage` | Host directory where uploaded files are stored (mounted into the app at `/data/storage`). Set this to e.g. `/mnt/ext_storage`. |
| `APP_URL` | `http://localhost:3033` | Public URL of the app. **Set this to your tunnel/reverse-proxy hostname** when exposing Vault publicly (used for auth and share links). |
| `BETTER_AUTH_SECRET` | *(auto-generated)* | Auth signing secret. Leave blank to auto-generate & persist one; set it to pin a known value. |

The database URL and Postgres credentials are wired between the containers
automatically and are not meant to be changed for a standard deploy.

---

## Adding drives and S3 backends

Sign in as the admin and open **Admin → Backends**:

- **Add another local drive**: choose type `LOCAL` and give it a base path
  (e.g. `/mnt/drive2`). Make sure that path is bind-mounted into the `app`
  container — add a volume line in `docker-compose.yml`:
  ```yaml
  app:
    volumes:
      - /mnt/drive2:/mnt/drive2
  ```
- **Add an S3 / MinIO / Hetzner backend**: choose type `S3` and fill in endpoint,
  region, bucket, and credentials (enable *forcePathStyle* for MinIO).
- Use **Test connection** to verify a backend (it writes, reads, and deletes a
  probe object) before relying on it.
- Exactly one backend is the **default**; new files use the nearest backend set
  on their folder subtree, falling back to the default.

New folders can be **targeted** at a specific backend (folder create dialog), so
you can route, say, `/Archive` to cold S3 storage while everything else stays local.

---

## Users, quotas, and sharing

- **Whitelist** (Admin → Whitelist): only whitelisted emails may register
  (except the very first user, who becomes admin).
- **Quotas & roles** (Admin → Users): set each user's quota (in GiB) and role.
  Quota changes apply to the next upload.
- **Sharing**: from the file browser, share any file or folder to a public link
  (`/s/<token>`) with an optional password and expiry. Folder shares are a
  read-only browser of that subtree; downloads are resumable and never escape
  the shared folder.

---

## Cloudflare Tunnel

Point a tunnel at the app and set `APP_URL` to your public hostname:

```bash
cloudflared tunnel --url http://localhost:3033
# or a named tunnel routing your hostname to http://localhost:3033
```

Then set `APP_URL=https://drive.example.com` in `.env` and
`docker compose up -d` again. Chunked uploads (50 MiB) and Range downloads keep
every request well within Cloudflare's 100 MB / ~100 s limits, so no extra tuning
is needed.

---

## Local development (without Docker)

```bash
pnpm install

# a local Postgres for dev (the compose one isn't published to the host)
docker run -d --name vault-pg -p 5432:5432 \
  -e POSTGRES_USER=vault -e POSTGRES_PASSWORD=vault -e POSTGRES_DB=vault \
  postgres:16

cp .env.example .env                 # uncomment the DATABASE_URL dev line
pnpm prisma migrate dev              # apply migrations
pnpm prisma db seed                  # seed the default backend (./data/drive1)
pnpm dev                             # http://localhost:3033
```

Useful scripts:

| Command | What it does |
|---|---|
| `pnpm dev` | Dev server on port 3033 |
| `pnpm build` | Production build (standalone) |
| `pnpm test` | Vitest unit/integration tests |
| `pnpm prisma:migrate` | `prisma migrate dev` |
| `pnpm prisma:seed` | Seed the default backend |
| `pnpm db:studio` | Prisma Studio |

---

## Tech stack

Next.js 16 (App Router, TypeScript strict) · React 19 · Prisma 7 + PostgreSQL 16
· BetterAuth · `@aws-sdk/client-s3` · Tailwind CSS 4 + shadcn/ui · Zod ·
Docker (multi-stage, standalone output).

See [CLAUDE.md](./CLAUDE.md) for an architecture overview and contributor notes.
