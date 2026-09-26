/**
 * The money cluster's icons, built from the shared set in
 * `components/domain/icons`. The payment methods are the shared `MethodIcon`,
 * so cash is the same coins here as at the desk.
 */
import { GLYPH, icon } from '../../../components/domain';
import { color } from '../../../theme';

export const BankIcon = icon(GLYPH.bank, { size: 18, width: 1.8 });

export const SearchIcon = icon(GLYPH.search, { size: 18, width: 1.8 });

export const CaretDownIcon = icon(GLYPH.caretDown, { size: 12, stroke: color.ink2, width: 2 });

/** How long a balance has been owed, on the debtor rows. */
export const OwedForIcon = icon(GLYPH.waiting, { size: 12, stroke: color.due, width: 2.2 });
