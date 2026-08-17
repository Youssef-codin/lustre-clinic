// The money screen's glyphs, traced from `money-dashboard-v2.html` — the same
// paths at the same viewBox, so the strokes land where the design puts them.
// They live here rather than in `ui/` because three of the four are a payment
// method, which is a domain fact; `ui/` may not know what Instapay is.
import type { PaymentMethod } from '@lustre/shared';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { color } from '../../../theme';

type IconProps = {
    size?: number;
    tone?: string;
};

const STROKE = {
    fill: 'none' as const,
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
};

export function MethodIcon({ method, size = 18, tone = color.muted }: IconProps & { method: PaymentMethod }) {
    if (method === 'visa') {
        return (
            <Svg width={size} height={size} viewBox="0 0 24 24" stroke={tone} {...STROKE}>
                <Rect x={2} y={5} width={20} height={14} rx={3} />
                <Path d="M2 10h20" />
            </Svg>
        );
    }

    if (method === 'instapay') {
        return (
            <Svg width={size} height={size} viewBox="0 0 24 24" stroke={tone} {...STROKE}>
                <Rect x={5} y={11} width={14} height={10} rx={2} />
                <Path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </Svg>
        );
    }

    if (method === 'other') {
        return (
            <Svg width={size} height={size} viewBox="0 0 24 24" fill={tone}>
                <Circle cx={5} cy={12} r={1} />
                <Circle cx={12} cy={12} r={1} />
                <Circle cx={19} cy={12} r={1} />
            </Svg>
        );
    }

    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" stroke={tone} {...STROKE}>
            <Rect x={2} y={6} width={20} height={12} rx={2} />
            <Circle cx={12} cy={12} r={2} />
            <Path d="M6 10h.01M18 14h.01" />
        </Svg>
    );
}

export function BankIcon({ size = 18, tone = color.muted }: IconProps) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" stroke={tone} {...STROKE}>
            <Path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
            <Path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
            <Path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
        </Svg>
    );
}

export function MoreIcon({ size = 18, tone = color.ink }: IconProps) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill={tone}>
            <Circle cx={5} cy={12} r={1.7} />
            <Circle cx={12} cy={12} r={1.7} />
            <Circle cx={19} cy={12} r={1.7} />
        </Svg>
    );
}

export function SearchIcon({ size = 18, tone = color.muted }: IconProps) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" stroke={tone} {...STROKE}>
            <Circle cx={11} cy={11} r={7} />
            <Path d="m20 20-3.5-3.5" />
        </Svg>
    );
}

export function CaretDownIcon({ size = 12, tone = color.ink2 }: IconProps) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" stroke={tone} {...STROKE} strokeWidth={2}>
            <Path d="m6 9 6 6 6-6" />
        </Svg>
    );
}
