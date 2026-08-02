import { Router } from 'express';
import { getStatus, postLogout, postTest } from './whatsapp.handler.ts';

const router = Router();

router.get('/status', getStatus);
router.post('/logout', postLogout);
router.post('/test', postTest);

export default router;
