import { Router } from 'express';
import { typed, validateSpec } from '../../middleware/validate.ts';
import * as handler from './appointment.handler.ts';
import {
    cancelAppointmentSpec,
    createAppointmentSpec,
    getAppointmentSpec,
    listDaySpec,
    updateAppointmentSpec,
} from './appointment.schema.ts';

const router = Router();

router.get('/', validateSpec(listDaySpec), typed(handler.listDay));
router.post('/', validateSpec(createAppointmentSpec), typed(handler.createAppointment));

router.get('/:id', validateSpec(getAppointmentSpec), typed(handler.getAppointment));
router.patch('/:id', validateSpec(updateAppointmentSpec), typed(handler.updateAppointment));
// Cancels rather than deletes — see `cancelAppointment` in the service.
router.delete('/:id', validateSpec(cancelAppointmentSpec), typed(handler.cancelAppointment));

export default router;
