import type { Request, Response } from 'express';
import { ok, respond } from '../../util/apiresponse.ts';
import { readPublicConfig } from './config.service.ts';

export async function getPublicConfig(_req: Request, res: Response): Promise<void> {
    respond(res, 200, ok(readPublicConfig()));
}
