import type { TypedHandler } from '../../middleware/validate.ts';
import { ok, respond } from '../../util/apiresponse.ts';
import type { findSlotsSpec } from './slots.schema.ts';
import * as service from './slots.service.ts';

export const findSlots: TypedHandler<typeof findSlotsSpec> = async (req, res) => {
    const { date, typeId } = req.valid.query;
    respond(res, 200, ok(service.findOpenSlots(date, typeId)));
};
