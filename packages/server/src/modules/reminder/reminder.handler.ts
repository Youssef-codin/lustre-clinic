import type { TypedHandler } from '../../middleware/validate.ts';
import { ok, respond } from '../../util/apiresponse.ts';
import type { listRemindersSpec } from './reminder.schema.ts';
import * as service from './reminder.service.ts';

export const listReminders: TypedHandler<typeof listRemindersSpec> = async (req, res) => {
    respond(res, 200, ok(service.listRemindersForDay(req.valid.query.date)));
};
