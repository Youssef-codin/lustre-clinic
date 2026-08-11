/**
 * `_Local` — BLOCKED.md: §10 freezes `domain/MoneyValue` as shared and
 * `components/domain/` does not exist yet; promote whole. §7.12: money is
 * integer piastres end to end and is formatted at the edge, in this component
 * only — `formatMoney` in `../money` is that edge, split out so it can be
 * tested without a renderer. §7.13: `EGP 2,600` leads in English; the Arabic
 * trailing order (`٢٬٦٠٠ ج.م`) is the `position = 'trail'` prop.
 */
import { Text, type TextTone, type TextVariant } from '../../../theme';
import { type CurrencyPosition, formatMoney } from '../money';

export type MoneyValueProps = {
    piastres: number;
    variant?: TextVariant;
    tone?: TextTone;
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
