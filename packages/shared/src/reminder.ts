/**
 * The reminder template's one token syntax, and the one substitution that
 * renders it (§11).
 *
 * This render lived in three places — the server sender, the demo sender and
 * the settings preview — and the three had drifted apart: the pane offered
 * `{name}` while both senders only ever substituted `{{name}}`, so a template
 * built from the chips reached the patient with the placeholder still in it.
 * One copy, imported by all three, is what stops a chip offering a token
 * nothing substitutes.
 *
 * `{{name}}` is the written form: it is what the chips insert, what the
 * seeded default carries, and what the preview renders. `{name}` is still
 * substituted on the way out because templates built from the old chips are
 * already saved in clinic databases, and a message that regressed to literal
 * braces on deploy is this same bug seen from the other side. Nothing offers
 * or writes the single-brace form.
 *
 * An unrecognized placeholder is left visible in either syntax, so a typo
 * shows rather than vanishing.
 */
import { REMINDER_PLACEHOLDERS, type ReminderPlaceholder } from './constants.ts';

/** `'name'` → `'{{name}}'`. The form the pane inserts and the preview reads. */
export function reminderToken(placeholder: ReminderPlaceholder): string {
    return `{{${placeholder}}}`;
}

/** Every supported token, in the order the settings pane draws its chips. */
export const REMINDER_TOKENS: readonly string[] = REMINDER_PLACEHOLDERS.map(reminderToken);

export function renderReminderTemplate(template: string, values: Record<string, string>): string {
    return template.replace(
        /\{\{\s*(\w+)\s*\}\}|\{\s*(\w+)\s*\}/g,
        (whole, double: string | undefined, single: string | undefined) => {
            const key = double ?? single;
            return key !== undefined && (REMINDER_PLACEHOLDERS as readonly string[]).includes(key)
                ? (values[key] ?? whole)
                : whole;
        },
    );
}
