/**
 * This cluster's icons, built from the shared set in `components/domain/icons`
 * and named after the job each does here.
 *
 * WhatsApp is `MessageCircle`: Lucide carries no brand marks, and a traced logo
 * is how a project ends up with two icon sets and a trademark question.
 */
import { GLYPH, icon } from '../../../components/domain';

export const WhatsAppIcon = icon(GLYPH.chat);
export const CallIcon = icon(GLYPH.call);

// The list's three. `patients-list.html` draws them heavier than the record's
// two — 2.2 on the magnifier, 2.4 on the plus and the row chevron — so the
// default width is per-glyph rather than set at every call site.
export const SearchIcon = icon(GLYPH.search, { width: 2.2 });
export const PlusIcon = icon(GLYPH.add, { width: 2.4 });

// The editor's Cancel. `patient-edit.html` draws it at 2.4 in the same round
// white button the record's back sits in — a cross and not a chevron, because
// leaving an editor abandons an edit rather than walking back a step.
export const CloseIcon = icon(GLYPH.close, { width: 2.4 });

// The record bar's menu — Edit, and Delete under the divider.
export const MoreIcon = icon(GLYPH.more, { width: 2.2 });
