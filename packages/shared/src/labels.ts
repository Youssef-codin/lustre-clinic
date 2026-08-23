/**
 * SPEC §14. Anything the clinic names itself is written twice — once per
 * language — and read back once, for whoever is looking. This is the single
 * answer to "which of the two do I show?", so that no screen decides for itself
 * and two screens never disagree.
 *
 * The locale is an argument rather than something read from app state, because
 * the viewer is not always the person holding the phone. Today every caller
 * passes the app's language, which is the secretary's. The patient-facing
 * tablet will pass the language the patient picked, against the same rows.
 *
 * Either side may be missing: a clinic that works in one language has no
 * translation to write. Falling back to the other language is what makes the
 * second label optional — a question always shows the words someone typed,
 * never a blank.
 */
import type { Locale } from './enums.ts';

/** Any row carrying a clinic-authored name in both languages. */
export interface BilingualLabel {
    label: string;
    labelAr?: string | null;
}

export function resolveLabel({ label, labelAr }: BilingualLabel, locale: Locale): string {
    const en = label.trim();
    const ar = labelAr?.trim() ?? '';
    return locale === 'ar' ? ar || en : en || ar;
}
