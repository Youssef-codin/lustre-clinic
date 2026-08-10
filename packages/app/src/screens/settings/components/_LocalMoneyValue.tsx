import { Text, type TextTone, type TextVariant } from '../../../theme';

/**
 * `domain/MoneyValue` — local until the real one exists.
 *
 * §10 lists it as pre-built and frozen, and it is not in the tree: `domain/`
 * has not been created, so this is the `_Local` version the BLOCKED.md rule
 * asks for, with the props the shared one should take. Delete it and change the
 * import when it lands.
 *
 * §7.12: money is integer piastres end to end, formatted at the edge and only
 * here. Whole EGP in the UI; piastres are never shown, so a price of 420_000 is
 * `EGP 4,200`. §7.13: the symbol leads in English and trails in Arabic — the
 * language is not switchable yet, so only the English order is implemented.
 */

export type MoneyValueProps = {
    /** Integer piastres. 100 piastres = 1 EGP. */
    piastres: number;
    variant?: TextVariant;
    tone?: TextTone;
    /** Omits the currency — for a value already sitting beside an `EGP` label. */
    bare?: boolean;
};

export function _LocalMoneyValue({ piastres, variant = 'amount', tone, bare = false }: MoneyValueProps) {
    return (
        <Text variant={variant} tone={tone}>
            {bare ? formatPounds(piastres) : `EGP ${formatPounds(piastres)}`}
        </Text>
    );
}

/**
 * Whole pounds, thousands separated. Latin numerals in both languages (§7.11).
 *
 * A fractional price rounds here, because §7.12 gives the UI nowhere to show
 * the piastres. Nothing in this cluster can create one — see `sanitisePounds`.
 */
export function formatPounds(piastres: number): string {
    return Math.round(piastres / 100).toLocaleString('en-US');
}

/**
 * Digits only, applied as the field is typed into.
 *
 * `ui/NumericField` is fixed to the `decimal-pad` keyboard, which offers a
 * separator that §7.12 leaves no room for: the UI shows whole EGP and never
 * shows piastres, so `4200.50` would be stored, displayed back as `4,200`, and
 * silently rewritten on the next save. Worse, stripping the point rather than
 * the fraction reads `4200.50` as 420,050 pounds — a hundredfold price, visible
 * to nobody until it is charged.
 *
 * So the separator never reaches the value. The constraint is applied where the
 * user can see it happening, not at save time.
 */
export function sanitisePounds(text: string): string {
    return text.replace(/[^0-9]/g, '');
}

/** The other edge: pounds typed into a field become the piastres we store. */
export function poundsToPiastres(pounds: string): number {
    const digits = sanitisePounds(pounds);
    return digits ? Number(digits) * 100 : 0;
}
