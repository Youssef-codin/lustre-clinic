import type { Request, Response } from 'express';
import { ok, respond } from '../../util/apiresponse.ts';
import * as service from './whatsapp.service.ts';

export async function getStatus(_req: Request, res: Response): Promise<void> {
    respond(res, 200, ok(service.readStatus()));
}

export async function postLogout(_req: Request, res: Response): Promise<void> {
    respond(res, 200, ok(await service.logout()));
}
