# amoCRM widget package

This folder is the **widget** that gets zipped and uploaded to amoCRM. It embeds the
React app (the `client/` build, served by `backend/`) inside amoCRM via an iframe on a
full-page tab (`widget_page`) in the left menu.

## Structure

```
widget/
  manifest.json        # widget metadata, locations
  script.js            # AMD module (amoCRM JS SDK) — injects the iframe
  images/
    logo.png           # REQUIRED — widget logo, 84x84 px
    logo_small.png     # REQUIRED — left-menu icon, ~24x24 px (white/transparent)
```

## Before uploading — checklist

1. **Set the app URL** in `script.js`:
   ```js
   var APP_URL = 'https://your-domain.com';   // your deployed React app (https)
   ```
   The widget opens `APP_URL/?account=<subdomain>`; the app uses that to call the backend.

2. **Add the logo images** to `images/` (`logo.png` 84x84, `logo_small.png` ~24x24).
   amoCRM rejects the package without them.

3. **OAuth is configured in the amoCRM developer panel, NOT here.** In your integration
   settings set:
   - Redirect URI: `https://your-domain.com/auth/callback`
   - Copy `client_id` / `client_secret` into `backend/.env` (`CLIENT_ID`, `CLIENT_SECRET`,
     `REDIRECT_URI`).

4. amoCRM serves the widget over **https only** — `APP_URL` and the backend must be https.

## Build the upload zip

The zip must contain the files at its **root** (not inside a `widget/` subfolder):

```bash
cd widget
zip -r ../widget.zip manifest.json script.js images
```

Upload `widget.zip` in the amoCRM developer panel → your integration → "Upload widget".

## How it renders

- `manifest.json` declares the `widget_page` location → a tab appears in the amoCRM left menu.
- When opened, `script.js` `render()` injects an `<iframe>` pointing to `APP_URL/?account=<subdomain>`.
- The React app detects the subdomain from `?account=` and talks to the backend, which holds
  the OAuth tokens and calls the amoCRM API.

## Note on translations (i18n)

Strings (`name`, `description`, `short_description`) are written directly in `manifest.json`
for now. If you later need per-language text, add an `i18n/<lang>.json` file and replace those
values with i18n keys (e.g. `"name": "widget.name"`).
