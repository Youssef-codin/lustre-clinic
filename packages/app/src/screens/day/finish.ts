/**
 * What the doctor's Finish tap does. Both buttons — the strip's Finish and the
 * card's Finish visit — go through here, so they cannot come to disagree.
 *
 * `askToEdit` is the clinic's setting, undefined until settings have loaded. It
 * is on by default, so the prompt is what a doctor gets before the answer is in:
 * a question too many is one tap, where a visit finished that should have been
 * edited first is a trip to the desk to correct it.
 *
 * `busy` is a finish or an editor load already in flight. The tap is refused
 * rather than queued, so a second press cannot finish twice or open the editor
 * over a finish that is still on its way.
 */
export type FinishPress = 'ask' | 'finish' | 'ignore';

export function finishPress(askToEdit: boolean | undefined, busy: boolean): FinishPress {
    if (busy) return 'ignore';
    return askToEdit === false ? 'finish' : 'ask';
}
