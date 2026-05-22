import { Router } from 'express';
import { authCallback, authInstall } from '../controllers/auth';

const router = Router();

router.get('/install', authInstall);

router.get('/callback', authCallback);

export default router;