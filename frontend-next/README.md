# SilverSurfers frontend (Next.js)

This is the only frontend application in this repository, using Next.js 15
(App Router). The legacy Create React App directory has been removed.
Make all frontend changes here; do not recreate a separate `frontend` app.

## Local development

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). Copy `.env.example` to
`.env.local` first and point `NEXT_PUBLIC_API_BASE_URL` at a running
backend (see `../backend`).

## Production build

```bash
pnpm build
pnpm start
```

`next.config.mjs` sets `output: "standalone"`, so `pnpm build` also emits a
self-contained `.next/standalone/server.js` — the shape the Docker image
below actually ships, not `pnpm start`'s dev-adjacent path.

## Docker

```bash
docker build \
  --build-arg NEXT_PUBLIC_API_BASE_URL=https://your-api.example.com \
  --build-arg NEXT_PUBLIC_GOOGLE_CLIENT_ID=your-client-id \
  -t silversurfers-frontend-next .

docker run -p 3000:3000 silversurfers-frontend-next
```

Both `NEXT_PUBLIC_*` args are baked into the client bundle at **build**
time (same convention as the old app's `REACT_APP_API_BASE_URL`) — they
cannot be changed by setting a runtime environment variable on the
container; rebuild the image instead.

The image is a two-stage build: a Node stage that installs deps and runs
`next build`, and a slim Node runtime stage that only carries the pruned
`.next/standalone` output. Unlike `../frontend`'s Nginx-based image, there's
no `nginx.conf` — Next's own Node server (`server.js`) serves everything,
including the server-side redirects a couple of routes depend on (see
`app/admin/page.js`'s comment for why that specifically matters here).

Both root Compose files build this directory as the `frontend` service,
using container `ss-frontend` and port `3000:3000`.

From the repository root, deploy just the frontend with:

```bash
docker compose -f docker-compose.production.yml up -d --build --no-deps frontend
```

Set `NEXT_PUBLIC_API_BASE_URL` and, when using Google sign-in,
`NEXT_PUBLIC_GOOGLE_CLIENT_ID` in the shell or root `.env` before building.
The testing Compose file uses `http://localhost:8000` for the API.
