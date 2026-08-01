import { Router } from 'express';
import { typed, validateSpec } from '../../middleware/validate.ts';
import { followScan, scanErrorHandler } from './scan.handler.ts';
import { followScanSpec } from './scan.schema.ts';

const router = Router();

router.get('/:ref', validateSpec(followScanSpec), typed(followScan));

// Router-scoped, so a bad scan renders a page for the person holding the phone
// while everything under /api keeps returning the JSON envelope.
router.use(scanErrorHandler);

export default router;
