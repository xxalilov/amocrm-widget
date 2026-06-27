import express  from 'express';
import { getCompanySettings, updateCompanySettings } from '../controllers/company-settings';

const router = express.Router();

router.get('/', getCompanySettings);
router.put('/', updateCompanySettings);
export default router;
