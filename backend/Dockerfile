# syntax=docker/dockerfile:1

# ────────────────────────────────────────────────────────────────
# Stage 1: deps — install production node_modules only
# ────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS deps

# Install a pinned pnpm version. Avoid pnpm@latest/Corepack drift in Coolify builds.
RUN npm install -g pnpm@10.14.0

WORKDIR /usr/src/app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile

# ────────────────────────────────────────────────────────────────
# Stage 2: final — API server (no browser required)
# ────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS final

ENV NODE_ENV=production \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

WORKDIR /usr/src/app

# Minimal OS deps (no Chromium — that lives in the scanner/worker images)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    dumb-init \
    && rm -rf /var/lib/apt/lists/*

# Copy pre-built node_modules and source
COPY --from=deps /usr/src/app/node_modules ./node_modules
COPY . .

RUN chown -R node:node /usr/src/app

USER node

# API server listens on PORT (default 8000); override via env
EXPOSE 8000

# dumb-init ensures clean signal handling (SIGTERM → graceful shutdown)
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "--import", "./scripts/register-typescript-loader.mjs", "src/server.ts"]
