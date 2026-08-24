/**
 * This cluster's icons — `lucide-react-native`, wrapped the same way the day
 * view and the patients cluster wrap theirs: named after the job rather than
 * the shape, with `stroke`/`width` as props so the library stays swappable from
 * one file.
 *
 * `settings.html` ships its own `IC` table of hand-drawn monoline glyphs and
 * every one of these was traced from it. That was wrong — CLAUDE.MD is explicit
 * that icons come from the library, "not to match a mockup" — so each is now
 * the nearest Lucide equivalent. Where the substitution changes what the glyph
 * depicts rather than just how it is drawn, it is noted in BLOCKED.md #29.
 *
 * WhatsApp is the documented exception: Lucide carries no brand marks, so it
 * comes from `@expo/vector-icons`, as it already does in
 * `screens/day/components/Reminders.tsx`.
 */
import { FontAwesome } from '@expo/vector-icons';
import {
    AppWindow,
    ArrowLeft,
    ArrowRight,
    Bell,
    CalendarDays,
    Check,
    ChevronLeft,
    ChevronRight,
    ClipboardList,
    Clock,
    EyeOff,
    Hospital,
    Info,
    ListPlus,
    MapPin,
    Pencil,
    Plus,
    Power,
    RefreshCw,
    Repeat,
    Tags,
    X,
} from 'lucide-react-native';
import { I18nManager } from 'react-native';
import { color } from '../../../theme';

export type IconProps = {
    size?: number;
    stroke?: string;
    width?: number;
};

type Glyph = typeof Clock;

function icon(Glyph: Glyph, defaults: Required<IconProps>) {
    return function Wrapped({
        size = defaults.size,
        stroke = defaults.stroke,
        width = defaults.width,
    }: IconProps) {
        return <Glyph size={size} color={stroke} strokeWidth={width} />;
    };
}

const ROW: Required<IconProps> = { size: 16, stroke: color.ink, width: 1.8 };

/**
 * The settings index's eight rows. They sit in one column and have to read as
 * one set, which is the whole reason they are all from the same library.
 */
const ROW_ICON = {
    app: icon(AppWindow, ROW),
    appointments: icon(CalendarDays, ROW),
    reminders: icon(Bell, ROW),
    clinic: icon(Hospital, ROW),
    branches: icon(MapPin, ROW),
    procedures: icon(Tags, ROW),
    fields: icon(ListPlus, ROW),
    about: icon(Info, ROW),
    hours: icon(Clock, ROW),
} as const;

export type SettingsGlyph = keyof typeof ROW_ICON;

export type SettingsIconProps = IconProps & {
    glyph: SettingsGlyph;
};

export function SettingsIcon({ glyph, ...rest }: SettingsIconProps) {
    const Glyph = ROW_ICON[glyph];
    return <Glyph {...rest} />;
}

/** The identity card's "Switch role" — two arrows doubling back on each other. */
export const SwitchRoleIcon = icon(Repeat, { size: 16, stroke: color.inverse, width: 2 });

/** Re-probe, on the dark card and in the App pane's server card. */
export const ReprobeIcon = icon(RefreshCw, { size: 14, stroke: color.ink, width: 2.2 });

export const PlusIcon = icon(Plus, { size: 14, stroke: color.inverse, width: 2.6 });

export const CloseIcon = icon(X, { size: 15, stroke: color.muted, width: 2.2 });

export const CheckIcon = icon(Check, { size: 15, stroke: color.muted, width: 2.4 });

export const InfoIcon = icon(Info, { size: 16, stroke: color.muted, width: 2 });

/** Deactivating or reactivating a branch, tinted by its caller. */
export const PowerIcon = icon(Power, { size: 15, stroke: color.ink, width: 2.2 });

/**
 * The data-entry pane `main` added. It has no mockup counterpart, so there is
 * nothing to match and the nearest library glyph is the honest answer.
 */
export const DataEntryIcon = icon(ClipboardList, ROW);

/** Taking a procedure out of the catalogue. */
export const HideIcon = icon(EyeOff, { size: 15, stroke: color.ink, width: 2.2 });

/** Renaming a category, from its section heading. */
export const EditIcon = icon(Pencil, { size: 15, stroke: color.muted, width: 2 });

/**
 * The reminder preview's channel mark. A brand glyph, so `@expo/vector-icons`
 * rather than Lucide — the one carve-out CLAUDE.MD names.
 */
export function WhatsAppIcon({ size = 15, stroke = color.wa }: Omit<IconProps, 'width'>) {
    return <FontAwesome name="whatsapp" size={size} color={stroke} />;
}

/**
 * Both of these mirror in Arabic as a glyph swap rather than a rotation:
 * rotating a round-capped stroke moves the caps.
 */
const ArrowForward = icon(ArrowRight, { size: 18, stroke: color.muted, width: 2.2 });
const ArrowBack = icon(ArrowLeft, { size: 18, stroke: color.muted, width: 2.2 });

/** The role sheet's from → to arrow. */
export function ArrowRightIcon(props: IconProps) {
    return I18nManager.isRTL ? <ArrowBack {...props} /> : <ArrowForward {...props} />;
}

const ChevronBack = icon(ChevronLeft, { size: 15, stroke: color.ink, width: 2.4 });
const ChevronForward = icon(ChevronRight, { size: 15, stroke: color.ink, width: 2.4 });

/** The pane header's back button. */
export function BackIcon(props: IconProps) {
    return I18nManager.isRTL ? <ChevronForward {...props} /> : <ChevronBack {...props} />;
}
