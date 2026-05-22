import { Router, Request, Response } from 'express';
import { checkAuth, findAllDuplicates, findAllLeadDuplicatesByName, merge, search, searchLeadsByNames } from '../controllers/dublicate';


const router = Router();

router.post('/search', search);

router.post('/find-all-duplicates',findAllDuplicates);

router.post('/merge', merge);

router.post('/search-leads-by-name', searchLeadsByNames);

router.post('/find-all-lead-duplicates-by-name', findAllLeadDuplicatesByName);

router.get('/check-auth', checkAuth);

export default router;