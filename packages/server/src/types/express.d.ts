import 'express';

declare global {
    namespace Express {
        interface Request {
            /**
             * Output of `validate()`. Populated only for the parts a route
             * declares a schema for; everything else stays `undefined`.
             * Express 5 makes `req.query` read-only, so parsed values live here
             * rather than being written back onto the request.
             */
            valid: {
                body?: unknown;
                params?: unknown;
                query?: unknown;
            };
        }
    }
}
