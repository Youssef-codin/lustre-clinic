import type { ZodType } from 'zod';

export type RequestPart = 'body' | 'params' | 'query';

export interface RequestSchema {
    part: RequestPart;
    schema: ZodType;
}

export const inBody = (schema: ZodType): RequestSchema => ({ part: 'body', schema });
export const inParams = (schema: ZodType): RequestSchema => ({ part: 'params', schema });
export const inQuery = (schema: ZodType): RequestSchema => ({ part: 'query', schema });
