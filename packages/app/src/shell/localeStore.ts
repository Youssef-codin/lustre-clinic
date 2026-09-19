// Compatibility path for screens already using the old module store. The
// provider now owns hydration, persistence, translations, and layout direction.
export { setLocale, useIsRTL, useLocale, useSetLocale, useT } from '../i18n';
