# syntax=docker/dockerfile:1

FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

# ---- deps: install dependencies (postinstall runs prisma generate) ----
FROM base AS deps
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN pnpm install --frozen-lockfile

# ---- builder: produce the Next.js standalone output ----
FROM base AS builder
# Placeholders so module-load-time checks pass during build (no DB is contacted).
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
ENV BETTER_AUTH_SECRET="build-time-placeholder-000000000000"
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm exec prisma generate && pnpm build

# ---- migrator: full toolchain to apply migrations + seed, then exit ----
FROM builder AS migrator
ENV NODE_ENV=production
CMD ["sh", "-lc", "pnpm exec prisma migrate deploy && pnpm exec prisma db seed"]

# ---- runner: slim standalone image ----
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
RUN apk add --no-cache su-exec \
  && addgroup -g 1001 -S nodejs \
  && adduser -u 1001 -S nextjs -G nodejs
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh && mkdir -p /data/storage /data/config
EXPOSE 3000
# Entrypoint starts as root to fix volume ownership + generate a secret, then
# drops to the non-root `nextjs` user to run the server.
ENTRYPOINT ["docker-entrypoint.sh"]
