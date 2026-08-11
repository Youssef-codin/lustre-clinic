/**
 * Stand-in for `domain/MoneyValue` until it exists. Money is integer piastres
 * end to end, formatted only at this edge: whole EGP, thousands separated,
 * Latin numerals in both languages. Fractions round here because the UI has
 * nowhere to show piastres and nothing in this cluster can create one. Input
 * strips the separator as typed, since `4200.50` would otherwise read as
 * 420,050 pounds.
 */
import { Text, type TextTone, type TextVariant } from '../../../theme';

export type MoneyValueProps = {
    piastres: number;
    variant?: TextVariant;
    tone?: TextTone;
    bare?: boolean;
};

export function _LocalMoneyValue({ piastres, variant = 'amount', tone, bare = false }: MoneyValueProps) {
    return (
        <Text variant={variant} tone={tone}>
            {bare ? formatPounds(piastres) : `EGP ${formatPounds(piastres)}`}
        </Text>
    );
}

export function formatPounds(piastres: number): string {
    return Math.round(piastres / 100).toLocaleString('en-US');
}

export function sanitisePounds(text: string): string {
    return text.replace(/[^0-9]/g, '');
}

export function poundsToPiastres(pounds: string): number {
    const digits = sanitisePounds(pounds);
    return digits ? Number(digits) * 100 : 0;
}
