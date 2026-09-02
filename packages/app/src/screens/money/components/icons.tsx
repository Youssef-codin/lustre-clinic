/**
 * The money cluster's icons — `lucide-react-native`, wrapped the same way the
 * day, patients and settings clusters wrap theirs: named after the job rather
 * than the shape, so the screens never import the library directly and it stays
 * swappable from one file.
 *
 * These were traced from `money-dashboard-v2.html` as raw `<Path>`s, which
 * CLAUDE.MD forbids. The four payment methods deliberately take the same Lucide
 * glyphs the day view already picked for them in
 * `screens/day/components/icons.tsx` — cash drawn as coins here and as
 * something else there is the inconsistency this whole change is about.
 */
import type { PaymentMethod } from '@lustre/shared';
import {
    ChevronDown,
    Coins,
    CreditCard,
    Landmark,
    MoreHorizontal,
    Receipt,
    Search,
    Zap,
} from 'lucide-react-native';
import { color } from '../../../theme';

export type IconProps = {
    size?: number;
    tone?: string;
};

type Glyph = typeof Search;

function icon(Glyph: Glyph, defaultSize: number, defaultTone: string, width = 1.8) {
    return function Wrapped({ size = defaultSize, tone = defaultTone }: IconProps) {
        return <Glyph size={size} color={tone} strokeWidth={width} />;
    };
}

const METHOD_GLYPH: Record<PaymentMethod, Glyph> = {
    cash: Coins,
    visa: CreditCard,
    instapay: Zap,
    other: Receipt,
};

export function MethodIcon({ method, size = 18, tone = color.muted }: IconProps & { method: PaymentMethod }) {
    const Glyph = METHOD_GLYPH[method];
    return <Glyph size={size} color={tone} strokeWidth={1.8} />;
}

export const BankIcon = icon(Landmark, 18, color.muted);

/** The header overflow. */
export const MoreIcon = icon(MoreHorizontal, 20, color.ink, 2.4);

export const SearchIcon = icon(Search, 18, color.muted);

export const CaretDownIcon = icon(ChevronDown, 12, color.ink2, 2);
