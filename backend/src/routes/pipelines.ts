import express from 'express';
import { listPipelines } from '../controllers/pipelines';

const router = express.Router();

router.get('/:subdomain', listPipelines);

export default router;
