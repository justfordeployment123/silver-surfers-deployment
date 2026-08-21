import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Next inferred the workspace root as the repo's grandparent directory
  // (it found a stray D:\Projects\package-lock.json above this repo) —
  // pin it explicitly to this project instead.
  outputFileTracingRoot: __dirname,

  // Phase 5 (Docker/Coolify cutover): 'standalone' makes `next build` emit
  // .next/standalone/server.js plus a pruned node_modules containing only
  // what's actually needed at runtime — replaces shipping the full
  // node_modules + running `next start` in the container, same trim CRA's
  // build/nginx.conf pairing achieved by only ever shipping static output.
  output: "standalone",
};

export default nextConfig;
