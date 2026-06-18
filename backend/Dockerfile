# Backend-only API image. Build context = backend/ (Dokploy default when this
# Dockerfile sits next to package.json). The SPA ships as a separate nginx image
# (see client/Dockerfile); this image has no client/build, so it serves API only.
#
# Local:  docker build -t amocrm-widget-server ./backend
# Dokploy: Build Type=Dockerfile, Docker File=backend/Dockerfile, Context blank.

# syntax=docker/dockerfile:1.7

# ---- Stage 1: tsc build ----
FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- Stage 2: runtime ----
FROM node:20-bookworm-slim AS runtime

# tini for PID 1 / signal handling. ca-certificates for outbound HTTPS to amoCRM.
# Infisical CLI is installed INTO the image (self-contained) so `infisical run`
# in the CMD works without bind-mounting the host binary.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ca-certificates \
      curl \
      tini \
 && curl -1sLf 'https://artifacts-cli.infisical.com/setup.deb.sh' | bash \
 && apt-get update \
 && apt-get install -y --no-install-recommends infisical \
 && apt-get purge -y curl \
 && apt-get autoremove -y \
 && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PORT=3000

WORKDIR /app

# Production node_modules only.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Compiled backend.
COPY --from=build /app/dist ./dist

RUN chown -R node:node /app
USER node

EXPOSE 3000

ENTRYPOINT ["/usr/bin/tini", "--"]
# Prod secrets come from Infisical at runtime. The CLI is installed in this image
# (above), so only the four INFISICAL_* bootstrap env vars need to be set on the
# container — no bind-mount required. For a plain `docker run` with a .env,
# override the CMD with: node dist/server.js
CMD ["sh", "-c", "infisical run -- node dist/server.js"]
