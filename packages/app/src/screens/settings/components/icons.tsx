/**
 * This cluster's icons, built from the shared set in `components/domain/icons`
 * and named after the job each does here.
 *
 * WhatsApp is the documented exception: Lucide carries no brand marks, so it
 * comes from `@expo/vector-icons`, as it already does in
 * `screens/day/components/Reminders.tsx`.
 */
import { FontAwesome } from '@expo/vector-icons';
import { GLYPH, type IconProps, icon } from '../../../components/domain';
import { useIsRTL } from '../../../i18n';
import { color } from '../../../theme';

export type { IconProps };

const ROW: Required<IconProps> = { size: 16, stroke: color.ink, width: 1.8 };

/**
 * The settings index's eight rows. They sit in one column and have to read as
 * one set, which is the whole reason they are all from the same library.
 */
const ROW_ICON = {
    app: icon(GLYPH.app, ROW),
    appointments: icon(GLYPH.appointments, ROW),
    reminders: icon(GLYPH.reminders, ROW),
    clinic: icon(GLYPH.clinic, ROW),
    branches: icon(GLYPH.branch, ROW),
    procedures: icon(GLYPH.procedures, ROW),
    fields: icon(GLYPH.fields, ROW),
    about: icon(GLYPH.info, ROW),
    hours: icon(GLYPH.time, ROW),
    backups: icon(GLYPH.backups, ROW),
    roles: icon(GLYPH.roles, ROW),
} as const;

export type SettingsGlyph = keyof typeof ROW_ICON;

export type SettingsIconProps = IconProps & {
    glyph: SettingsGlyph;
};

export function SettingsIcon({ glyph, ...rest }: SettingsIconProps) {
    const Glyph = ROW_ICON[glyph];
    return <Glyph {...rest} />;
}

/**
 * The off-site backup warning. A cloud rather than a database or a key: what
 * stopped is the copy leaving the building, and the local dumps are fine.
 */
export const DriveAlertIcon = icon(GLYPH.driveAlert, { size: 18, stroke: color.dueText, width: 2 });

/** The identity card's "Scan a role code". */
export const ScanCodeIcon = icon(GLYPH.scanCode, { size: 16, stroke: color.inverse, width: 2 });

/** Re-probe, on the dark card and in the App pane's server card. */
export const ReprobeIcon = icon(GLYPH.reprobe, { size: 14, stroke: color.ink, width: 2.2 });

export const PlusIcon = icon(GLYPH.add, { size: 14, stroke: color.inverse, width: 2.6 });

export const CloseIcon = icon(GLYPH.close, { size: 15, stroke: color.muted, width: 2.2 });

export const CheckIcon = icon(GLYPH.check, { size: 15, stroke: color.muted, width: 2.4 });

export const InfoIcon = icon(GLYPH.info, { size: 16, stroke: color.muted, width: 2 });

/** Deactivating or reactivating a branch, tinted by its caller. */
export const PowerIcon = icon(GLYPH.deactivate, { size: 15, stroke: color.ink, width: 2.2 });

/** Putting the demo's clinic back the way it opens. No mockup counterpart either. */
export const ResetDemoIcon = icon(GLYPH.resetDemo, ROW);

/** Leaving the demo for the clinic server. No mockup counterpart. */
export const LeaveDemoIcon = icon(GLYPH.leaveDemo, ROW);

/** Entering the demo from a connected dev build. No mockup counterpart. */
export const EnterDemoIcon = icon(GLYPH.enterDemo, ROW);

/** "Report a problem". No mockup counterpart. */
export const ReportProblemIcon = icon(GLYPH.reportProblem, ROW);

/** Taking a procedure out of the catalogue. */
export const HideIcon = icon(GLYPH.hide, { size: 15, stroke: color.ink, width: 2.2 });

/** Renaming a category, from its section heading. */
export const EditIcon = icon(GLYPH.edit, { size: 15, stroke: color.muted, width: 2 });

/** The ghost "Category" button beside "Add a procedure", as the mockup draws it. */
export const CategoryIcon = icon(GLYPH.category, { size: 15, stroke: color.muted, width: 2 });

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
const ArrowForward = icon(GLYPH.forward, { size: 18, stroke: color.muted, width: 2.2 });
const ArrowBack = icon(GLYPH.back, { size: 18, stroke: color.muted, width: 2.2 });

/** The role sheet's from → to arrow. */
export function ArrowRightIcon(props: IconProps) {
    return useIsRTL() ? <ArrowBack {...props} /> : <ArrowForward {...props} />;
}

const ChevronBack = icon(GLYPH.chevronBack, { size: 15, stroke: color.ink, width: 2.4 });
const ChevronForward = icon(GLYPH.chevronForward, { size: 15, stroke: color.ink, width: 2.4 });

/** The pane header's back button. */
export function BackIcon(props: IconProps) {
    return useIsRTL() ? <ChevronForward {...props} /> : <ChevronBack {...props} />;
}
