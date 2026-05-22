import { NextFunction, Response, Request } from "express";
import axios from "axios";
import { models } from '../utils/database';
import { HttpException } from '../exceptions/HttpException';


const accountModel = models.Account;

export const authInstall = async (req: Request, res: Response, next: NextFunction) => {
  const { subdomain } = req.query;
  if (!subdomain || typeof subdomain !== 'string') {
    return res.status(400).send('subdomain required');
  }
  const state = JSON.stringify({ subdomain });
  const authUrl = `https://www.amocrm.ru/oauth2/authorize?client_id=${process.env.CLIENT_ID}&state=${state}&response_type=code&redirect_uri=${process.env.REDIRECT_URI}`;
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
    if (existingAccount) {
      await existingAccount.update({
        access_token: response.data.access_token,
        refresh_token: response.data.refresh_token,
        expires_at: Date.now() + response.data.expires_in * 1000
      });
    } else {
      await accountModel.create({
        name: subdomain,
        subdomain,
        access_token: response.data.access_token,
        refresh_token: response.data.refresh_token,
        expires_at: Date.now() + response.data.expires_in * 1000
      });
    }

    res.send(`
      <html>
      <body style="font-family: sans-serif; text-align: center; margin-top: 50px;">
        <h2>✅ Integration successful!</h2>
        <p><a href="/?account=${subdomain}">Go to duplicate finder</a></p>
        <script>setTimeout(()=>{ location.href='/?account=${subdomain}'; }, 3000);</script>
      </body>
      </html>
    `);
  } catch (err: any) {
    console.error(err.response?.data || err.message);
    res.status(500).send('Authentication failed');
  }
}