// `_Local` per §10: `domain/MoneyValue` is listed as shared but `domain/` does
// not exist yet. This is the only place the cluster turns a number into money;
// the formatting rules live in `money.ts`. `script="mono"` is explicit rather
// than left to detection: the Arabic form carries `ج.م`, which would otherwise
// pull the whole string — digits included — onto the Naskh face and out of
// tabular alignment.
//
// `symbol={false}` drops `EGP` for a column that has already said it is money —
// the history's amounts run down one edge and the three letters on every row
// are noise. It is off only where the heading or the neighbouring line carries
// the currency; a number alone in running text always keeps it.
import type { TextTone, TextVariant, TextWeight } from '../../../theme';
import { Text } from '../../../theme';
import type { MoneyLocale } from './money';
import { formatAmount, formatMoney } from './money';

export type _LocalMoneyValueProps = {
    amount: number;
    tone?: TextTone;
    variant?: TextVariant;
    weight?: TextWeight;
    symbol?: boolean;
    locale?: MoneyLocale;
};

export function _LocalMoneyValue({
    amount,
    tone = 'ink',
    variant = 'amount',
    weight,
    symbol = true,
    locale = 'en',
}: _LocalMoneyValueProps) {
    return (
        <Text variant={variant} tone={tone} weight={weight} script="mono">
            {symbol ? formatMoney(amount, locale) : formatAmount(amount)}
        </Text>
    );
}
