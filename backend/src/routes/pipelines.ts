import express from 'express';
import { listPipelines } from '../controllers/pipelines';

const router = express.Router();

router.get('/', listPipelines);

export default router;
