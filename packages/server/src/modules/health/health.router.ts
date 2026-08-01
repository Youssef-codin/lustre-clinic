import { Router } from 'express';
import { getHealth } from './health.handler.ts';

const router = Router();

router.get('/', getHealth);

export default router;
