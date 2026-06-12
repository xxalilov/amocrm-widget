import express from 'express';
import { getLeadSettings, updateLeadSettings } from '../controllers/lead-setting';

const router = express.Router();

router.get('/', getLeadSettings);

router.put('/', updateLeadSettings);

export default router;  