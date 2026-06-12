import express  from 'express';
import { getContactSettings, updateContactSettings } from '../controllers/contact-settings';

const router = express.Router();

router.get('/', getContactSettings);
router.put('/', updateContactSettings);
export default router;