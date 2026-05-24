# --- Build stage ---
FROM node:18-alpine AS build
WORKDIR /app

# Pass API base at build-time for CRA
ARG REACT_APP_API_BASE_URL=http://localhost:8000
ENV REACT_APP_API_BASE_URL=${REACT_APP_API_BASE_URL}

# Install a pinned pnpm version. Avoid pnpm@latest/Corepack drift in Coolify builds.
RUN npm install -g pnpm@10.14.0

# Install dependencies first
COPY package.json pnpm-lock.yaml* ./
RUN if [ -f pnpm-lock.yaml ]; then pnpm install --frozen-lockfile; else pnpm install; fi

# Copy the rest of the source and build
COPY . .
RUN pnpm run build

# --- Runtime stage ---
FROM nginx:alpine

# Nginx config for SPA routing
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy build output
COPY --from=build /app/build /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
