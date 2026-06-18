# SPA image: builds the CRA client with REACT_APP_API_BASE_URL baked in, serves
# the static bundle via nginx. The backend (amoCRM API) lives at a separate
# origin, so set CORS_ORIGIN on the backend to this SPA's origin.
#
# Local:
#   docker build --build-arg REACT_APP_API_BASE_URL=https://api.example.com \
#     -t amocrm-widget-client ./client
#   docker run --rm -p 8080:80 amocrm-widget-client
#
# Dokploy: Build Type=Dockerfile, Docker File=client/Dockerfile, Context blank.
# Set the build arg REACT_APP_API_BASE_URL to the backend's public URL.

# syntax=docker/dockerfile:1.7

# ---- Stage 1: build ----
FROM node:20-bookworm-slim AS build
WORKDIR /app

# Public URL of the backend API (e.g. https://api.example.com). Empty default
# keeps the unified deployment / local dev working with same-origin requests.
ARG REACT_APP_API_BASE_URL=""
ENV REACT_APP_API_BASE_URL=${REACT_APP_API_BASE_URL}

COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- Stage 2: nginx ----
FROM nginx:1.27-alpine AS runtime

# SPA fallback so client-side routes resolve to index.html.
RUN printf '%s\n' \
  'server {' \
  '  listen 80;' \
  '  server_name _;' \
  '  root /usr/share/nginx/html;' \
  '  index index.html;' \
  '  location / {' \
  '    try_files $uri $uri/ /index.html;' \
  '  }' \
  '  location ~* \.(?:js|css|woff2?|ttf|eot|svg|png|jpg|jpeg|gif|webp|ico)$ {' \
  '    expires 30d;' \
  '    access_log off;' \
  '    add_header Cache-Control "public, immutable";' \
  '  }' \
  '}' > /etc/nginx/conf.d/default.conf

# CRA builds to build/ (not dist/).
COPY --from=build /app/build /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
