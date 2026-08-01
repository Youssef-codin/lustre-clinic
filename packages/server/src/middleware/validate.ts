import { ERROR_CODE, type FieldIssue } from '@mawid/shared';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ZodType, z } from 'zod';
import { AppError } from '../errors/AppError.ts';
import type { RequestSchema } from '../util/schema.helper.ts';

export interface ValidationSpec {
    body?: ZodType;
    params?: ZodType;
    query?: ZodType;
}

/** What a route's handler sees once `validate()` has run. */
export type ValidatedRequest<S extends ValidationSpec> = Request & {
    valid: {
        [K in keyof S]: S[K] extends ZodType ? z.infer<S[K]> : never;
    };
};

export type TypedHandler<S extends ValidationSpec> = (
    req: ValidatedRequest<S>,
    res: Response,
    next: NextFunction,
) => Promise<unknown> | unknown;

/**
 * Zod at every boundary — body, params, query. Anything that fails becomes a
 * 400 carrying the field paths, so the frontend can point at the right input.
 */
export function validate(...parts: RequestSchema[]): RequestHandler {
    return (req, _res, next) => {
        const issues: FieldIssue[] = [];
        const valid: Request['valid'] = {};

        for (const { part, schema } of parts) {
            const result = schema.safeParse(req[part]);
            if (result.success) {
                valid[part] = result.data;
            } else {
                for (const issue of result.error.issues) {
                    issues.push({ path: [part, ...issue.path].join('.'), message: issue.message });
                }
            }
        }

        if (issues.length > 0) {
            next(new AppError(400, ERROR_CODE.VALIDATION_FAILED, 'Request validation failed', issues));
            return;
        }

        req.valid = valid;
        next();
    };
}

/**
 * Adapts a schema-typed handler to Express's untyped `RequestHandler`. The one
 * place a cast is allowed — every route gets its types from `validate()`'s spec
 * without repeating them.
 */
export function typed<S extends ValidationSpec>(handler: TypedHandler<S>): RequestHandler {
    return handler as unknown as RequestHandler;
}
