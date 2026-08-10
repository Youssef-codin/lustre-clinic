// `_Local` per §10: `domain/MoneyValue` is listed as shared but `domain/` does
// not exist yet. This is the only place the cluster turns a number into money;
// the formatting rules live in `money.ts`. `script="mono"` is explicit rather
// than left to detection: the Arabic form carries `ج.م`, which would otherwise
// pull the whole string — digits included — onto the Naskh face and out of
// tabular alignment.
import type { TextTone, TextVariant } from '../../../theme';
import { Text } from '../../../theme';
import type { MoneyLocale } from './money';
import { formatMoney } from './money';

export type _LocalMoneyValueProps = {
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
        <Text variant={variant} tone={tone} script="mono">
            {formatMoney(amount, locale)}
        </Text>
    );
}
