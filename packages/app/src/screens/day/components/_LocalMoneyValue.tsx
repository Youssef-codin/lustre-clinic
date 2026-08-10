import { Text, type TextTone, type TextVariant } from '../../../theme';
import { type CurrencyPosition, formatMoney } from '../money';

/**
 * `_Local` — BLOCKED.md. §10 freezes `domain/MoneyValue` as shared and
 * `components/domain/` does not exist yet. Promote it whole.
 *
 * §7.12: money is integer piastres end to end and is formatted at the edge, in
 * this component only — `formatMoney` in `../money` is that edge, split out so
 * it can be tested without a renderer. No screen divides by 100 itself.
 *
 * §7.13: `EGP 2,600` in English. The Arabic order (`٢٬٦٠٠ ج.م`, symbol
 * trailing) is a prop rather than a per-screen decision, and lands with the
 * localisation scaffold.
 */

export type MoneyValueProps = {
    /** Integer piastres, as stored and as sent (§9). */
    piastres: number;
    variant?: TextVariant;
    tone?: TextTone;
    /** `trail` is the Arabic order. */
    position?: CurrencyPosition;
};

export function _LocalMoneyValue({
    piastres,
    variant = 'amount',
    tone = 'ink',
    position = 'lead',
}: MoneyValueProps) {
    return (
        <Text variant={variant} tone={tone}>
            {formatMoney(piastres, position)}
        </Text>
    );
}
