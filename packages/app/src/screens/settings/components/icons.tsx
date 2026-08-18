/**
 * This cluster's icons. Unlike the day view and the patients cluster, which wrap
 * `lucide-react-native`, these are the mockup's own path data: `settings.html`
 * draws every index row from one `IC` table of single-path monoline glyphs, and
 * a Lucide stand-in would change the drawing on the one screen where eight of
 * them sit in a column and have to look like one set. The paths below are copied
 * from that table verbatim — edit them there first.
 *
 * `hours` is the exception, and the only glyph with no mockup counterpart: the
 * design's index has no working-hours row (see BLOCKED.md). It is drawn in the
 * same 24-unit box off the same clock the `about` circle uses so it does not
 * read as an import from another set.
 */
import { I18nManager } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { color } from '../../../theme';

export const SETTINGS_PATH = {
    app: 'M4 5h16v14H4zM4 10h16M8 14h8',
    appointments: 'M5 5h14v15H5zM5 10h14M9 3v4M15 3v4M12 14v2h3',
    reminders: 'M18 9a6 6 0 1 0-12 0c0 6-2 7-2 7h16s-2-1-2-7M10.5 20a2 2 0 0 0 3 0',
    clinic: 'M12 3l8 5v12H4V8zM10 20v-5h4v5M12 10v3M10.5 11.5h3',
    branches: 'M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11zM12 10h.01',
    procedures: 'M4 7h16v11H4zM4 11h16M8 15h4M20 7l-3-3H7L4 7',
    fields: 'M4 6h16M4 12h16M4 18h9M18 16v4M16 18h4',
    about: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 8h.01M11 12h1v4h1',
    hours: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2',
} as const;

export type SettingsGlyph = keyof typeof SETTINGS_PATH;

export type SettingsIconProps = {
    glyph: SettingsGlyph;
    size?: number;
    stroke?: string;
    width?: number;
};

/** The index row's glyph: 16px, ink, 1.8 — the tile around it is `SettingsRow`. */
export function SettingsIcon({ glyph, size = 16, stroke = color.ink, width = 1.8 }: SettingsIconProps) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
            <Path
                d={SETTINGS_PATH[glyph]}
                stroke={stroke}
                strokeWidth={width}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </Svg>
    );
}

type GlyphProps = {
    size?: number;
    stroke?: string;
    width?: number;
};

function glyph(path: string, defaults: Required<Omit<GlyphProps, never>>) {
    return function Wrapped({
        size = defaults.size,
        stroke = defaults.stroke,
        width = defaults.width,
    }: GlyphProps) {
        return (
            <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
                <Path
                    d={path}
                    stroke={stroke}
                    strokeWidth={width}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
            </Svg>
        );
    };
}

/** The identity card's "Switch role" — two arrows doubling back on each other. */
export const SwitchRoleIcon = glyph(
    'M17 1l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3',
    {
        size: 16,
        stroke: color.inverse,
        width: 2,
    },
);

/**
 * Re-probe. The mockup draws two of these — a closed loop on the dark card, an
 * open one in the App pane's server card — and they are the same gesture at two
 * sizes, so this is the open form used at both.
 */
export const ReprobeIcon = glyph('M20 11a8 8 0 1 0-2.3 6.3M20 5v6h-6', {
    size: 14,
    stroke: color.ink,
    width: 2.2,
});

export const PlusIcon = glyph('M12 5v14M5 12h14', { size: 14, stroke: color.inverse, width: 2.6 });

export const CloseIcon = glyph('M6 6l12 12M18 6L6 18', { size: 15, stroke: color.muted, width: 2.2 });

export const CheckIcon = glyph('M4 12.5l5.5 5.5L20 7', { size: 15, stroke: color.muted, width: 2.4 });

/** Deactivate / reactivate a branch: the power glyph, tinted by its caller. */
export const PowerIcon = glyph('M12 4v8M18.4 6.6a9 9 0 1 1-12.8 0', {
    size: 15,
    stroke: color.ink,
    width: 2.2,
});

export const InfoIcon = glyph('M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M12 8h.01M11 12h1v4h1', {
    size: 16,
    stroke: color.muted,
    width: 2,
});

/**
 * "Show N inactive" on the procedures list. The mockup's pupil is a `<circle>`;
 * it is written as an arc pair here so the whole glyph stays one path like the
 * rest of the set.
 */
export const EyeIcon = glyph(
    'M2.5 12s3.6-6 9.5-6 9.5 6 9.5 6-3.6 6-9.5 6-9.5-6-9.5-6M14.6 12a2.6 2.6 0 1 1-5.2 0 2.6 2.6 0 0 1 5.2 0',
    { size: 13, stroke: color.muted, width: 2.2 },
);

/**
 * The reminder preview's WhatsApp mark. Lucide carries no brand marks and the
 * mockup draws its own outline speech bubble rather than the trademarked glyph,
 * which is the drawing kept here.
 */
export const WhatsAppIcon = glyph('M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 20.5l1.7-5.4A8.5 8.5 0 1 1 21 11.5z', {
    size: 15,
    stroke: color.wa,
    width: 2,
});

/**
 * The role sheet's from → to arrow. Mirrored in Arabic the way the mockup's
 * `chevFlip` mirrors it, as a second path rather than a transform: rotating a
 * round-capped stroke moves the caps (`patients/components/icons.tsx` makes the
 * same call for its row chevron).
 */
const ArrowForward = glyph('M5 12h14M13 6l6 6-6 6', { size: 18, stroke: color.muted, width: 2.2 });
const ArrowBack = glyph('M19 12H5M11 6l-6 6 6 6', { size: 18, stroke: color.muted, width: 2.2 });

export function ArrowRightIcon(props: GlyphProps) {
    return I18nManager.isRTL ? <ArrowBack {...props} /> : <ArrowForward {...props} />;
}
