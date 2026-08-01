import { Router } from 'express';
import { typed, validateSpec } from '../../middleware/validate.ts';
import * as handler from './patient.handler.ts';
import {
    createPatientSpec,
    getPatientSpec,
    searchPatientsSpec,
    updatePatientSpec,
} from './patient.schema.ts';

const router = Router();

// Static routes before param routes — a future `/patients/recent` would
// otherwise be swallowed by `/patients/:id`. See spec §3.
router.get('/', validateSpec(searchPatientsSpec), typed(handler.searchPatients));
router.post('/', validateSpec(createPatientSpec), typed(handler.createPatient));

router.get('/:id', validateSpec(getPatientSpec), typed(handler.getPatient));
router.patch('/:id', validateSpec(updatePatientSpec), typed(handler.updatePatient));

export default router;
