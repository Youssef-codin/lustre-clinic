/**
 * This cluster's icons — `lucide-react-native`, wrapped the same way the day
 * view wraps its own (`screens/day/components/icons.tsx`): named after the job,
 * with `stroke`/`width` as props so the library stays swappable from one file.
 * Cluster-local rather than shared because `domain/` does not exist yet; the two
 * wrappers are the same eight lines and belong together when it does.
 *
 * WhatsApp is `MessageCircle`: Lucide carries no brand marks, and a traced logo
 * is how a project ends up with two icon sets and a trademark question.
 */
import { MessageCircle, Phone } from 'lucide-react-native';
import { color } from '../../../theme';

export type IconProps = {
    size?: number;
    stroke?: string;
    width?: number;
};

type Glyph = typeof Phone;

function icon(Glyph: Glyph, defaultWidth = 2) {
    return function Wrapped({ size = 15, stroke = color.muted, width = defaultWidth }: IconProps) {
        return <Glyph size={size} color={stroke} strokeWidth={width} />;
    };
}

export const WhatsAppIcon = icon(MessageCircle);
export const CallIcon = icon(Phone);
