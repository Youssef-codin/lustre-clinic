import type { TextTone, TextVariant } from '../../../theme';
import { Text } from '../../../theme';
import type { MoneyLocale } from './money';
import { formatMoney } from './money';

/**
 * `_Local` per §10: `domain/MoneyValue` is listed as pre-built and shared, and
 * `domain/` does not exist yet. Noted in `BLOCKED.md`; this is the cluster's
 * copy and it is the only place in the cluster that turns a number into money.
 *
 * The formatting itself is in [`money.ts`](./money.ts) — §7.12, §7.13, and the
 * reason each rule exists.
 */

export type _LocalMoneyValueProps = {
    /** Integer piastres. */
    amount: number;
    tone?: TextTone;
    variant?: TextVariant;
    locale?: MoneyLocale;
};

export function _LocalMoneyValue({
    amount,
    tone = 'ink',
    variant = 'amount',
    locale = 'en',
}: _LocalMoneyValueProps) {
    return (
        // `script="mono"` is explicit rather than left to detection: the Arabic
        // form carries `ج.م`, which would otherwise pull the whole string —
        // digits included — onto the Naskh face and out of tabular alignment.
        <Text variant={variant} tone={tone} script="mono">
            {formatMoney(amount, locale)}
        </Text>
    );
}
