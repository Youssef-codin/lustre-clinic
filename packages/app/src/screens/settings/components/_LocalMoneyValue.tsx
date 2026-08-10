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

/** Whole pounds, thousands separated. Latin numerals in both languages (§7.11). */
export function formatPounds(piastres: number): string {
    return Math.round(piastres / 100).toLocaleString('en-US');
}

/** The other edge: pounds typed into a field become the piastres we store. */
export function poundsToPiastres(pounds: string): number {
    const digits = pounds.replace(/[^0-9]/g, '');
    return digits ? Number(digits) * 100 : 0;
}
