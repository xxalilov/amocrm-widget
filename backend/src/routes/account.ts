import express from 'express';
import { getAccounts, getAccountBySubdomain } from '../controllers/account';

const router = express.Router();

router.get('/:subdomain', getAccountBySubdomain);
router.get('/', getAccounts);

export default router;