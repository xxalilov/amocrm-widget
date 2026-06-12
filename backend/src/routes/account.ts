import express from 'express';
import { getMe } from '../controllers/account';

const router = express.Router();

router.get('/me', getMe);

export default router;