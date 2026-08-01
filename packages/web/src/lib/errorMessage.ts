import { errorKey, type TranslationKey, type Vars } from '../i18n/index.ts';
import { ApiError } from './api.ts';

type Translate = (key: TranslationKey, vars?: Vars) => string;

/**
 * Server error messages are English and meant for logs. The UI shows the
 * localized text for the error *code* instead — which is exactly why domain
 * failures carry codes (spec §3).
 */
export function localizeError(t: Translate, err: unknown): string {
    if (err instanceof ApiError) return t(errorKey(err.code));
    if (err instanceof Error) return err.message;
    return String(err);
}
