import type { NextFunction, Request, Response } from 'express';
import { getConfig } from '../../config/index.ts';
import { AppError } from '../../errors/AppError.ts';
import type { TypedHandler } from '../../middleware/validate.ts';
import type { followScanSpec } from './scan.schema.ts';
import { recordScan } from './scan.service.ts';

/**
 * 302 rather than 301: a permanent redirect would be cached by the phone's
 * browser, and the same slip must resolve again the next time it is scanned —
 * that is the whole demo moment.
 */
export const followScan: TypedHandler<typeof followScanSpec> = async (req, res) => {
    const { patientId } = recordScan(req.valid.params.ref);
    res.redirect(302, `/p/${patientId}`);
};

/**
 * `/s/:ref` is opened by a camera app, not by the frontend, so a failure here
 * is read by a person holding a phone. The JSON envelope the API uses would be
 * gibberish to them — this renders a short bilingual page instead.
 */
export function scanErrorHandler(err: unknown, _req: Request, res: Response, next: NextFunction): void {
    if (res.headersSent) {
        next(err);
        return;
    }

    if (!(err instanceof AppError)) {
        next(err);
        return;
    }

    const { clinic } = getConfig();
    const unreadable = err.status === 400;

    const ar = unreadable ? 'رمز غير صالح' : 'لم يتم العثور على هذا الحجز';
    const en = unreadable ? 'That code could not be read' : 'No booking matches this code';

    res.status(err.status)
        .type('html')
        .send(page(clinic.name, clinic.nameEn, ar, en, clinic.phone));
}

function escapeHtml(value: string): string {
    return value.replace(
        /[&<>"]/g,
        (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c,
    );
}

/** Self-contained: this must render before, or without, the SPA bundle loading. */
function page(name: string, nameEn: string, ar: string, en: string, phone: string): string {
    return `<!doctype html>
<html lang="ar" dir="rtl">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(nameEn)}</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 0; min-height: 100vh;
         display: grid; place-items: center; text-align: center; padding: 24px;
         color: #1a1a1a; background: #fafafa; }
  h1 { font-size: 1.1rem; font-weight: 600; margin: 0 0 4px; }
  p { margin: 4px 0; color: #555; }
  .en { direction: ltr; font-size: .9rem; color: #777; }
</style>
<div>
  <h1>${escapeHtml(name)}</h1>
  <p>${escapeHtml(ar)}</p>
  <p class="en">${escapeHtml(en)}</p>
  <p class="en">${escapeHtml(phone)}</p>
</div>
</html>`;
}
