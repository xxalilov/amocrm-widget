import express from 'express';
import { listHistory } from '../controllers/history';

const router = express.Router();

router.get('/:accountId', listHistory);

export default router;
