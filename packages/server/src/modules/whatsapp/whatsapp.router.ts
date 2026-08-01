import { Router } from 'express';
import { getStatus, postLogout } from './whatsapp.handler.ts';

const router = Router();

router.get('/status', getStatus);
router.post('/logout', postLogout);

export default router;
