import { Router } from 'express';
import { getPublicConfig } from './config.handler.ts';

const router = Router();

router.get('/', getPublicConfig);

export default router;
