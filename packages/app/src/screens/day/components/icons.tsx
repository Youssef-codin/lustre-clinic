import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { color } from '../../../theme';

/**
 * The day view's line icons, traced from `day-view-schedule.html` the way
 * `domain/BottomTabBar` traces the tab bar's. 24×24 viewbox, stroked, no fill —
 * the design draws every icon that way and sizes it at the call site.
 *
 * They live in the cluster rather than in `ui/`: none of them is a control, and
 * the moment a second screen wants one it should move whole.
 */

export type IconProps = {
    size?: number;
    /** Any token colour. Defaults to the surrounding text's muted grey. */
    stroke?: string;
    width?: number;
};

function Icon({
    size = 15,
    stroke = color.muted,
    width = 2,
    children,
}: IconProps & { children: React.ReactNode }) {
    return (
        <Svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke={stroke}
            strokeWidth={width}
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            {children}
        </Svg>
    );
}

/** The branch pill. A pin, because a branch is a place. */
export function PinIcon(props: IconProps) {
    return (
        <Icon {...props}>
            <Path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z" />
            <Circle cx={12} cy={10} r={2.5} />
        </Icon>
    );
}

export function CalendarIcon(props: IconProps) {
    return (
        <Icon {...props}>
            <Rect x={3} y={5} width={18} height={16} rx={3} />
            <Path d="M3 10h18M8 3v4M16 3v4" />
        </Icon>
    );
}

/** Beside a duration, and on the chair card. */
export function ClockIcon(props: IconProps) {
    return (
        <Icon {...props}>
            <Circle cx={12} cy={12} r={9} />
            <Path d="M12 7v5l3 2" />
        </Icon>
    );
}

/** The section arrows: what is behind the clinic, and what is ahead of it. */
export function ArrowBackIcon(props: IconProps) {
    return (
        <Icon width={2.2} {...props}>
            <Path d="M19 12H6M11 6l-6 6 6 6" />
        </Icon>
    );
}

export function ArrowForwardIcon(props: IconProps) {
    return (
        <Icon width={2.2} {...props}>
            <Path d="M5 12h13M13 6l6 6-6 6" />
        </Icon>
    );
}

/** The reminders tab — a message, not yet a channel. */
export function ChatIcon(props: IconProps) {
    return (
        <Icon {...props}>
            <Path d="M21 11.5a8.4 8.4 0 0 1-12.3 7.5L3 20.5l1.6-5.4A8.4 8.4 0 1 1 21 11.5z" />
        </Icon>
    );
}

/** Skip — this one patient is not owed a message. */
export function CloseIcon(props: IconProps) {
    return (
        <Icon width={2.2} {...props}>
            <Path d="M6 6l12 12M18 6L6 18" />
        </Icon>
    );
}

/** Check in, and finish. */
export function CheckIcon(props: IconProps) {
    return (
        <Icon width={2.4} {...props}>
            <Path d="M4 12.5l5.5 5.5L20 7" />
        </Icon>
    );
}
