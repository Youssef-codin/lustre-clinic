/**
 * "Book later" used to open the patient's record, which took the secretary off
 * the day for a question she had just declined. It is a navigation outcome
 * decided in JSX, so what is held here is the shape that decides it: the
 * book-next prompt offers exactly one answer that goes anywhere, and the day
 * screen wires the other one to something that does not navigate.
 *
 * Source-level, like `components/ui/boundaries.test.ts`, because the guarantee
 * is structural — a renderer would only re-check the same wiring at more cost.
 */
import { describe, expect, it } from 'bun:test';
import path from 'node:path';

const DAY_ROOT = path.resolve(import.meta.dir);

async function read(file: string): Promise<string> {
    return Bun.file(path.join(DAY_ROOT, file)).text();
}

describe('the book-next prompt after a check-in', () => {
    it('offers one answer that leaves the day, and it is not Book later', async () => {
        const sheet = await read('components/BookNextSheet.tsx');

        const handlers = [...sheet.matchAll(/^\s{4}(on[A-Z]\w*):/gm)].map((match) => match[1]);

        // `onClosed` reports the slide, it does not answer the question.
        expect(handlers).toEqual(['onBookNow', 'onLater', 'onClosed']);
    });

    it('sends Book later, the scrim and the hardware back to the same handler', async () => {
        const sheet = await read('components/BookNextSheet.tsx');

        // The scrim and the hardware back are `Sheet`'s `onClose`.
        expect(sheet).toContain('onClose={onLater}');
        expect(sheet).toContain('onPress={onLater}');
        // Three separate handlers is how the button and the scrim came to
        // disagree in the first place.
        expect(sheet).not.toContain('onDismiss');
    });

    it('answers Book later without opening a record', async () => {
        const screen = await read('DayScreen.tsx');

        const later = screen.match(/onLater=\{([^}]*)\}/);
        expect(later?.[1]).toBe('() => stayOnDay(bookNext.patient, bookNext.seated)');

        const stayOnDay = screen.match(/function stayOnDay\([\s\S]*?\n {4}\}/)?.[0] ?? '';
        expect(stayOnDay).not.toBe('');
        // The two ways off the day screen: the record, and pushing a page.
        expect(stayOnDay).not.toContain('onOpenRecord');
        expect(stayOnDay).not.toContain('pushPage');
        expect(stayOnDay).toContain('setToast');
    });

    it('still takes Book next now into the booking page', async () => {
        const screen = await read('DayScreen.tsx');

        const bookNextOn = screen.match(/function bookNextOn\([\s\S]*?\n {4}\}/)?.[0] ?? '';
        expect(bookNextOn).toContain("pushPage({ name: 'booking'");
    });
});
