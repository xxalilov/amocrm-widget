import { Router, Request, Response } from 'express';
import { checkAuth, findAllDuplicates, getScanJob, merge, mergeAll, mergeLog, search, searchLeadsByNames } from '../controllers/dublicate';


const router = Router();

router.post('/search', search);

router.post('/find-all-duplicates',findAllDuplicates);

router.post('/merge', merge);

router.post('/merge-all', mergeAll);

router.post('/merge/log', mergeLog);

router.post('/search-leads-by-name', searchLeadsByNames);

router.get('/jobs/:jobId', getScanJob);

router.get('/check-auth', checkAuth);

export default router;