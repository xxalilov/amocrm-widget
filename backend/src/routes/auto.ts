import { Router } from 'express';
import { claimAuto, completeAuto, autoStatus } from '../controllers/auto';
import { findAllDuplicates, getScanJob, mergeLog } from '../controllers/dublicate';

// Driven by widget/script.js (background auto-merge loop). It claims a due run,
// starts a scan, polls it, performs the native merges in the browser, logs each,
// then reports completion. The scan/job/log handlers are reused from the
// duplicate controller; claim/complete enforce the per-account schedule + lease.
const router = Router();

router.post('/claim', claimAuto);
router.post('/complete', completeAuto);
router.get('/status', autoStatus);

router.post('/find-all-duplicates', findAllDuplicates);
router.get('/jobs/:jobId', getScanJob);
router.post('/merge/log', mergeLog);

export default router;
