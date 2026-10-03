# frontend-next — Next.js 15 (App Router) production image.
#
# Replaces frontend/Dockerfile's build(node)+runtime(nginx) two-stage shape
# with build(node)+runtime(node) — Next's own Node server handles SPA-style
# routing/redirects natively (see app/admin/page.js's redirect() for an
# example that specifically depends on a real Node server, not static
# hosting), so there's no nginx.conf equivalent to write here.
#
# Node 18 (frontend/Dockerfile's base) is well past EOL by now; 22 is the
# current LTS line (active until ~Oct 2025, maintenance until ~Apr 2027).

# ─────────────────────────────────────────────────────────────────────────
# Build stage
# ─────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app

# NEXT_PUBLIC_* vars are baked into the client bundle at build time, same
# build-time-baked semantics as CRA's REACT_APP_* convention (see
# .env.example). Both must be passed as --build-arg at image build time —
# they cannot be changed later by just setting a runtime env var.
ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
ARG NEXT_PUBLIC_GOOGLE_CLIENT_ID=
ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL}
ENV NEXT_PUBLIC_GOOGLE_CLIENT_ID=${NEXT_PUBLIC_GOOGLE_CLIENT_ID}

# Install a pinned pnpm version. Avoid pnpm@latest/Corepack drift in
# Coolify builds — same reasoning as frontend/Dockerfile's pin.
RUN npm install -g pnpm@10.14.0

# Install dependencies first (cache layer — only re-runs when lockfile/
# manifest actually change, not on every source edit).
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml* .npmrc* ./
RUN pnpm install --frozen-lockfile

# Copy the rest of the source and build. next.config.mjs's
# output: "standalone" makes this emit .next/standalone/server.js plus a
# pruned node_modules — the runtime stage below only needs that output,
# not the full node_modules this stage installed.
COPY . .
RUN pnpm run build

# ─────────────────────────────────────────────────────────────────────────
# Runtime stage
# ─────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Run as a non-root user, matching Next.js's own documented Docker example.
RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs

# Standalone output doesn't include public/ or .next/static — Next expects
# those copied in manually alongside server.js.
COPY --from=build /app/public ./public
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
