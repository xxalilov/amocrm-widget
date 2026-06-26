import { Router } from 'express';
import cors from 'cors';
import { authCallback, authInstall, getWidgetKey, AMO_ORIGIN_RE } from '../controllers/auth';

const router = Router();

router.get('/install', authInstall);

router.get('/callback', authCallback);

// script.js (running on the account's amoCRM page) fetches its API key here.
// CORS is opened only to amoCRM/Kommo account origins; the controller also
// verifies the origin's subdomain matches the requested one.
const amoCors = cors({
  origin: (origin, cb) => cb(null, !!origin && AMO_ORIGIN_RE.test(origin)),
});
router.options('/widget-key', amoCors);
router.get('/widget-key', amoCors, getWidgetKey);

export default router;