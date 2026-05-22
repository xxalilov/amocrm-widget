import express  from 'express';
import { getContactSettings, updateContactSettings } from '../controllers/contact-settings';

const router = express.Router();

router.get('/:id', getContactSettings);
router.put('/:id', updateContactSettings);
export default router;