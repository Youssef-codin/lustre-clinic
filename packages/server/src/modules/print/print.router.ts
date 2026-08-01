import { Router } from 'express';
import { typed, validateSpec } from '../../middleware/validate.ts';
import * as handler from './print.handler.ts';
import { printDaySpec, printSlipSpec } from './print.schema.ts';

const router = Router();

router.get('/failures', handler.listPrintFailures);
router.post('/day', validateSpec(printDaySpec), typed(handler.printDay));
router.post('/slip/:appointmentId', validateSpec(printSlipSpec), typed(handler.printSlip));

export default router;
