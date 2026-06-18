# amoCRM Duplicate Finder/Merger

amoCRM widget that finds and merges duplicate contacts and leads. The browser
(iframe) talks only to the backend; the backend holds the OAuth tokens and calls
the amoCRM REST API.

## Structure
```
backend/   Express + TypeScript + Sequelize (PostgreSQL) — amoCRM API + auth
client/    Create React App — the widget UI (iframe)
widget/    amoCRM widget package (manifest.json + script.js + images) → widget.zip
```

## Deployment — two separate images (like tezkel-dashboard)

The backend (API) and client (SPA) deploy as **independent images** on separate
origins. CORS connects them.

| Image | Dockerfile | Serves | Port |
|-------|-----------|--------|------|
| API   | `backend/Dockerfile` | amoCRM API + OAuth + widget auth | 3000 |
| SPA   | `client/Dockerfile`  | static React build via nginx     | 80   |

```bash
# Backend
docker build -t amocrm-widget-server ./backend

# Client (bake in the backend's public URL)
docker build --build-arg REACT_APP_API_BASE_URL=https://api.example.com \
  -t amocrm-widget-client ./client
```

> The backend image also supports a **unified** deployment: if a `client/build`
> is present at `../../client/build`, it serves the SPA itself. In the split
> setup there is no `client/build`, so it serves API only and non-API paths 404.

### Secrets (production: Dokploy + Infisical)
The backend image's CMD is `infisical run -- node dist/server.js`. In production,
all app secrets (`CLIENT_ID`, `CLIENT_SECRET`, `JWT`/`DB`/…) come from Infisical at
runtime; only the `INFISICAL_*` bootstrap vars are set on the container and the
host's `/usr/bin/infisical` is bind-mounted in. See `backend/.env.example`.

For a plain `docker run` with a `.env` instead, override the CMD:
`node dist/server.js`.

### Environment variables (`backend/.env.example`)
- `CLIENT_ID` / `CLIENT_SECRET` / `REDIRECT_URI` — amoCRM integration (one set, static)
- `CORS_ORIGIN` — the SPA origin (required in the split deployment)
- `APP_ENV` — `prod` (widget key required) or `dev` (keyless, for testing)
- `DB_*`, `PORT`, `JOB_CONCURRENCY`

### Origins to keep consistent
- amoCRM integration `redirect_uri` = `https://<api-origin>/auth/callback`
- `REDIRECT_URI` (backend) = the same
- `REACT_APP_API_BASE_URL` (client build arg) = `https://<api-origin>`
- widget `script.js` `APP_URL` = `https://<spa-origin>`
- backend `CORS_ORIGIN` = `https://<spa-origin>`

## Local development
```bash
cd backend && npm install && npm run dev     # API on :3000
cd client  && npm install && npm start       # CRA on :3000 (proxy) / same origin
```
`APP_ENV=dev` lets you open the frontend without a widget key.

## Build (unified, one host)
```bash
cd backend && npm run build:all && npm start  # builds client + backend, serves both
```

## Widget package
See `widget/README.md` — zip `manifest.json` + `script.js` + `images/` and upload
in the amoCRM integration. Set `APP_URL` in `widget/script.js` to the SPA origin.
