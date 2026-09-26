/**
 * A phone number as it is shown: held left to right whatever line it sits in.
 *
 * In an Arabic line the leading `+` is a neutral character and goes with the
 * paragraph, so `+201004001008` drew as `201004001008+`. A left-to-right
 * isolate (U+2066 … U+2069) keeps the number one run, and costs nothing in an
 * English line. Display only: dialling, WhatsApp links and search all take the
 * stored value, never this.
 */
export function phoneText(phone: string): string {
    return `⁦${phone}⁩`;
}
