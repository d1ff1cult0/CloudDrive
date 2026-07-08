#!/bin/sh
set -e

# Ensure data dirs exist and are writable by the non-root runtime user.
mkdir -p /data/storage /data/config
chown -R nextjs:nodejs /data 2>/dev/null || true

# Auto-generate a stable auth secret if the operator didn't provide one.
# Persisted on the config volume so sessions survive restarts.
if [ -z "$BETTER_AUTH_SECRET" ]; then
  if [ ! -f /data/config/auth_secret ]; then
    head -c 32 /dev/urandom | base64 | tr -d '\n' > /data/config/auth_secret
  fi
  BETTER_AUTH_SECRET="$(cat /data/config/auth_secret)"
  export BETTER_AUTH_SECRET
fi

# Drop privileges and start the Next.js standalone server.
exec su-exec nextjs:nodejs node server.js
