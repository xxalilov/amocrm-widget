import express from 'express';
import { getLeadSettings, updateLeadSettings } from '../controllers/lead-setting';

const router = express.Router();

router.get('/:id', getLeadSettings);

router.put('/:id', updateLeadSettings);

export default router;  