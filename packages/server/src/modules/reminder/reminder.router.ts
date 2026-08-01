import { Router } from 'express';
import { typed, validateSpec } from '../../middleware/validate.ts';
import { listReminders } from './reminder.handler.ts';
import { listRemindersSpec } from './reminder.schema.ts';

const router = Router();

router.get('/', validateSpec(listRemindersSpec), typed(listReminders));

export default router;
