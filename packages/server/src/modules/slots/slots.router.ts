import { Router } from 'express';
import { typed, validateSpec } from '../../middleware/validate.ts';
import { findSlots } from './slots.handler.ts';
import { findSlotsSpec } from './slots.schema.ts';

const router = Router();

router.get('/', validateSpec(findSlotsSpec), typed(findSlots));

export default router;
