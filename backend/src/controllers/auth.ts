import { NextFunction, Response, Request } from "express";
import axios from "axios";
import { randomBytes } from "crypto";
import { models } from '../utils/database';
import { HttpException } from '../exceptions/HttpException';


const accountModel = models.Account;

function generateWidgetKey(): string {
  return randomBytes(24).toString('hex');
}

// amoCRM / Kommo account origins, e.g. https://mycompany.amocrm.ru
export const AMO_ORIGIN_RE = /^https:\/\/([a-z0-9-]+)\.(amocrm\.(ru|com)|kommo\.com)$/i;

// Hands the widget's script.js its account's API key so it can authorize the
// SPA without the user copying anything. Safe because the caller must be inside
// that account's own amoCRM page: the request Origin must be <subdomain>.amocrm.ru
// AND match the requested subdomain. (CORS for this route is opened to amo origins
// in routes/auth.ts.) Only an installed account (with a stored key) resolves.
export const getWidgetKey = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const subdomain = String(req.query.subdomain || '').toLowerCase().trim();
    if (!subdomain) throw new HttpException(400, 'subdomain required');

    const origin = String(req.headers.origin || '');
    const m = origin.match(AMO_ORIGIN_RE);
    if (!m || m[1].toLowerCase() !== subdomain) {
      throw new HttpException(403, 'origin mismatch');
    }

    const account = await accountModel.findOne({ where: { subdomain } });
    if (!account || !account.widget_key) throw new HttpException(404, 'not installed');

    res.json({ key: account.widget_key });
  } catch (err) {
    next(err);
  }
}

export const authInstall = async (req: Request, res: Response, next: NextFunction) => {
  const { subdomain } = req.query;
  if (!subdomain || typeof subdomain !== 'string') {
    return res.status(400).send('subdomain required');
  }
  // amoCRM's authorization endpoint is /oauth (NOT /oauth2/authorize, which 405s).
  // The redirect_uri is configured in the integration settings, not passed here.
  const state = encodeURIComponent(JSON.stringify({ subdomain }));
  const clientId = encodeURIComponent(process.env.CLIENT_ID || '');
  const authUrl = `https://www.amocrm.ru/oauth?client_id=${clientId}&state=${state}&mode=post_message`;
  res.redirect(authUrl);
}

export const authCallback = async (req: Request, res: Response, next: NextFunction) => {
    const { code, referer, state } = req.query;
  if (!code || typeof code !== 'string') {
    return res.status(400).send('No code');
  }

  let subdomain: string | null = null;
  if (referer && typeof referer === 'string') {
    const match = referer.match(/^([^.]+)\.amocrm\.ru$/);
    subdomain = match ? match[1] : null;
  }
  if (!subdomain && state && typeof state === 'string') {
    try {
      const parsed = JSON.parse(state);
      subdomain = parsed.subdomain;
    } catch(e) {}
  }
  if (!subdomain) {
    throw new HttpException(400, 'Cannot identify subdomain');
  }

  try {
    const tokenUrl = `https://${subdomain}.amocrm.ru/oauth2/access_token`;
    const response = await axios.post(tokenUrl, {
      client_id: process.env.CLIENT_ID,
      client_secret: process.env.CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: process.env.REDIRECT_URI
    });

    const existingAccount = await accountModel.findOne({ where: { subdomain } });
    let account;
    if (existingAccount) {
      await existingAccount.update({
        access_token: response.data.access_token,
        refresh_token: response.data.refresh_token,
        expires_at: Date.now() + response.data.expires_in * 1000,
        // Keep an existing key; only generate one if missing.
        widget_key: existingAccount.widget_key || generateWidgetKey(),
      });
      account = existingAccount;
    } else {
      account = await accountModel.create({
        name: subdomain,
        subdomain,
        access_token: response.data.access_token,
        refresh_token: response.data.refresh_token,
        expires_at: Date.now() + response.data.expires_in * 1000,
        widget_key: generateWidgetKey(),
      });
    }

    // Hand the widget key back to the widget. This page runs in the OAuth popup
    // opened by the widget; it posts the key to the opener (the widget shows it
    // with a Copy button) and closes. It also displays the key as a fallback when
    // opened directly / when the popup was blocked.
    const key = account.widget_key;
    // Target the widget's own origin for postMessage (CORS_ORIGIN = SPA origin).
    const spaOrigin = (process.env.CORS_ORIGIN || '').split(',')[0].trim() || '*';
    res.send(`
      <html>
      <body style="font-family: sans-serif; text-align: center; margin-top: 50px;">
        <h2>✅ Integration successful!</h2>
        <p>Paste this API key into the widget settings (field "API key"):</p>
        <p style="font-family: monospace; font-size: 16px; background:#f4f4f4; padding:10px 14px; display:inline-block; border-radius:6px; user-select:all;">${key}</p>
        <button onclick="navigator.clipboard.writeText('${key}')"
          style="font-size:14px; padding:8px 16px; border:none; border-radius:6px; background:#2b7cff; color:#fff; cursor:pointer;">Copy</button>
        <p style="color:#888; font-size:13px;">You can close this window and return to the widget.</p>
        <script>
          try {
            if (window.opener) {
              window.opener.postMessage({ type: 'amo_widget_key', key: '${key}' }, '${spaOrigin}');
              setTimeout(function () { window.close(); }, 1200);
            }
          } catch (e) {}
        </script>
      </body>
      </html>
    `);
  } catch (err: any) {
    console.error(err.response?.data || err.message);
    res.status(500).send('Authentication failed');
  }
}