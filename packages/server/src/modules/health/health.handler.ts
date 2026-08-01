import type { Request, Response } from 'express';
import { ok, respond } from '../../util/apiresponse.ts';
import { readHealth } from './health.service.ts';

export async function getHealth(_req: Request, res: Response): Promise<void> {
    const health = readHealth();
    respond(res, health.ok ? 200 : 503, ok(health));
}
