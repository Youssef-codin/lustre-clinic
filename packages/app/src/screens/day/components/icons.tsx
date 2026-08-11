/**
 * The day view's icons — `lucide-react-native`, wrapped. The wrapper is thin
 * and does two things: it names each icon after the job it does here rather
 * than after its shape, and it keeps `stroke`/`width` as props so the call
 * sites read the same as every other styled thing and the library stays
 * swappable from one file. The procedure icon is a stethoscope: the design
 * draws a molar, Lucide has no tooth, and a hand-traced one-off is how a
 * project ends up with two icon sets.
 */
import {
    ArrowLeft,
    ArrowRight,
    Calendar,
    Check,
    Clock,
    MapPin,
    MessageCircle,
    Stethoscope,
    X,
} from 'lucide-react-native';
import { color } from '../../../theme';

export type IconProps = {
    size?: number;
    stroke?: string;
    width?: number;
};

type Glyph = typeof Clock;

function icon(Glyph: Glyph, defaultWidth = 2) {
    return function Wrapped({ size = 15, stroke = color.muted, width = defaultWidth }: IconProps) {
        return <Glyph size={size} color={stroke} strokeWidth={width} />;
    };
}

export const PinIcon = icon(MapPin);

export const CalendarIcon = icon(Calendar);

export const ClockIcon = icon(Clock);

export const ProcedureIcon = icon(Stethoscope, 1.8);

export const ArrowBackIcon = icon(ArrowLeft, 2.2);

export const ArrowForwardIcon = icon(ArrowRight, 2.2);

export const ChatIcon = icon(MessageCircle);

export const CloseIcon = icon(X, 2.2);

export const CheckIcon = icon(Check, 2.4);
