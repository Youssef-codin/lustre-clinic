// Wrong numbers on the money screens are worse than missing ones, and `bun
// test` has no renderer, so what is tested here is everything that decides a
// figure: the piastre-to-pound conversion, the compact form, the currency
// rule, the overpayment clamp, and the derivations the screens trust.
import { describe, expect, it } from 'bun:test';
import { moneyApi } from './_LocalMoneyApi';
import { dueLabel, outstandingAge, statsPeriodLabel, takingsLabel } from './format';
import {
    amountStillDue,
    clampToBalance,
    collectedAhead,
    collectionRate,
    currencyLeads,
    DEBTOR_SORT_LABEL,
    DEBTOR_SORTS,
    formatEgp,
    isWholePounds,
    sortDebtors,
    toEgp,
} from './money';

describe('piastres to pounds (§7.12)', () => {
    it('never shows piastres', () => {
        expect(toEgp(260_000)).toBe(2_600);
        expect(toEgp(0)).toBe(0);
    });

    it('rounds a part-pound to the nearer pound rather than dropping it', () => {
        expect(toEgp(12_050)).toBe(121);
        expect(toEgp(12_049)).toBe(120);
    });
});

describe('formatting', () => {
    it('groups thousands', () => {
        expect(formatEgp(260_000)).toBe('EGP 2,600');
        expect(formatEgp(1_000_000)).toBe('EGP 10,000');
        expect(formatEgp(90_000)).toBe('EGP 900');
    });

    it('puts the currency first in English and last in Arabic (§7.13)', () => {
        expect(formatEgp(260_000, { locale: 'en' })).toBe('EGP 2,600');
        expect(formatEgp(260_000, { locale: 'ar' })).toBe('2,600 ج.م');
    });

    it('keeps Latin numerals in Arabic (§7.11)', () => {
        expect(formatEgp(260_000, { locale: 'ar' })).toContain('2,600');
    });

    it('omits the currency when asked', () => {
        expect(formatEgp(260_000, { showCurrency: false })).toBe('2,600');
    });

    it('handles zero', () => {
        expect(formatEgp(0)).toBe('EGP 0');
    });
});

describe('compact form — hero and stat cards only (§7.12)', () => {
    it('is the design figure', () => {
        expect(formatEgp(14_262_000, { compact: true })).toBe('EGP 142.6k');
    });

    it('leaves four-digit amounts alone, where compact would lose more than it saves', () => {
        expect(formatEgp(999_900, { compact: true })).toBe('EGP 9,999');
        expect(formatEgp(1_000_000, { compact: true })).toBe('EGP 10k');
    });

    it('drops a trailing .0', () => {
        expect(formatEgp(2_500_000, { compact: true })).toBe('EGP 25k');
    });

    it('promotes to millions instead of reading 1000k', () => {
        expect(formatEgp(99_995_000, { compact: true })).toBe('EGP 1m');
        expect(formatEgp(120_000_000, { compact: true })).toBe('EGP 1.2m');
    });
});

describe('overpayment does not exist (§7.6)', () => {
    it('caps a payment at the balance', () => {
        expect(clampToBalance(5_000, 260_000)).toBe(260_000);
    });

    it('passes a payment under the balance through untouched', () => {
        expect(clampToBalance(1_000, 260_000)).toBe(100_000);
    });

    it('caps against the balance in piastres, not the rounded pound figure', () => {
        expect(toEgp(12_050)).toBe(121);
        expect(clampToBalance(121, 12_050)).toBe(12_050);
    });

    it('never produces a negative or fractional payment', () => {
        expect(clampToBalance(-50, 260_000)).toBe(0);
        expect(clampToBalance(0, 260_000)).toBe(0);
        expect(clampToBalance(Number.NaN, 260_000)).toBe(0);
        expect(clampToBalance(10.7, 260_000)).toBe(1_000);
    });

    it('allows nothing against a settled visit', () => {
        expect(clampToBalance(500, 0)).toBe(0);
    });
});

describe('outstanding age', () => {
    const now = new Date('2026-08-09T12:00:00.000Z');

    it('counts whole days, then coarsens', () => {
        expect(outstandingAge('2026-08-09T09:00:00.000Z', now)).toBe('today');
        expect(outstandingAge('2026-08-08T09:00:00.000Z', now)).toBe('1 day');
        expect(outstandingAge('2026-07-28T09:00:00.000Z', now)).toBe('12 days');
        expect(outstandingAge('2026-05-02T09:00:00.000Z', now)).toBe('3 months');
        expect(outstandingAge('2025-01-14T09:00:00.000Z', now)).toBe('1 year');
    });
});

describe('balances are derived, never stored (§10)', () => {
    it('reports a patient total that is the sum of their unpaid visits', async () => {
        const report = await moneyApi.outstanding();

        const mariam = report.patients.find((row) => row.name === 'Mariam Hassan');
        expect(mariam?.balance).toBe(435_000);
    });

    it('reports a total that is the sum of the patient balances', async () => {
        const report = await moneyApi.outstanding();
        const summed = report.patients.reduce((total, row) => total + row.balance, 0);

        expect(report.total).toBe(summed);
    });

    it('excludes a visit that is settled in full — there is no unpaid status', async () => {
        const report = await moneyApi.outstanding();

        expect(report.patients.some((row) => row.name === 'Hana Mostafa')).toBe(false);
        expect(await moneyApi.byPatient('p-6')).toEqual([]);
    });

    it('dates the balance from the oldest unpaid visit', async () => {
        const report = await moneyApi.outstanding();
        const nour = report.patients.find((row) => row.patientId === 'p-3');

        expect(nour?.oldestUnpaidAt).toBe('2026-01-14T16:45:00.000Z');
    });

    it('moves the balance when a payment row is added, and only then', async () => {
        const before = await moneyApi.visit('v-7');
        expect(before.balance).toBe(520_000);

        const after = await moneyApi.recordPayment({ visitId: 'v-7', amount: 20_000, method: 'cash' });

        expect(after.paidTotal).toBe(20_000);
        expect(after.balance).toBe(500_000);
        expect(after.chargedTotal).toBe(before.chargedTotal);
    });
});

describe('takings', () => {
    it('sums to the collected figure the summary reports, for every period', async () => {
        for (const period of ['today', 'week', 'month', 'year', 'all'] as const) {
            const [summary, takings] = await Promise.all([
                moneyApi.summary(period),
                moneyApi.takings(period),
            ]);

            const summed = takings.byMethod.reduce((total, row) => total + row.amount, 0);

            expect(takings.total).toBe(summed);
            expect(summary.collected).toBe(takings.total);
            expect(summary.difference).toBe(summary.charged - summary.collected);
        }
    });
});

describe('the payment field takes whole pounds only (§7.12)', () => {
    it('accepts digits and an empty field', () => {
        expect(isWholePounds('')).toBe(true);
        expect(isWholePounds('2600')).toBe(true);
    });

    it('refuses a decimal rather than reinterpreting it', () => {
        expect(isWholePounds('12.50')).toBe(false);
        expect(isWholePounds('12.')).toBe(false);
        expect(isWholePounds('12,50')).toBe(false);
        expect(isWholePounds('١٢')).toBe(false);
        expect(isWholePounds('-5')).toBe(false);
        expect(isWholePounds('1e3')).toBe(false);
    });

    it('would have overcharged a hundredfold under the old strip-the-dot rule', () => {
        const stripped = Number('12.50'.replace(/[^0-9]/g, ''));
        expect(stripped).toBe(1250);
        expect(clampToBalance(stripped, 500_000)).toBe(125_000);
        expect(isWholePounds('12.50')).toBe(false);
    });
});

describe('a period can collect more than it charged', () => {
    const quietDay = { charged: 40_000, collected: 160_000, difference: -120_000 };

    it('never draws a negative amount due (§7.6)', () => {
        expect(amountStillDue(quietDay.difference)).toBe(0);
        expect(formatEgp(amountStillDue(quietDay.difference))).toBe('EGP 0');
    });

    it('caps the collection rate at 100%, so the split bar has somewhere to put it', () => {
        expect(collectionRate(quietDay.charged, quietDay.collected)).toBe(1);
        expect(collectionRate(240_000, 120_000)).toBe(0.5);
    });

    it('reports what was collected against earlier visits rather than hiding it', () => {
        expect(collectedAhead(quietDay.difference)).toBe(120_000);
        expect(collectedAhead(50_000)).toBe(0);
    });

    it('treats a period that charged nothing as fully collected', () => {
        expect(collectionRate(0, 0)).toBe(1);
        expect(collectionRate(0, 90_000)).toBe(1);
    });

    it('leaves an ordinary period untouched', () => {
        expect(amountStillDue(2_382_000)).toBe(2_382_000);
        expect(collectedAhead(2_382_000)).toBe(0);
        expect(Math.round(collectionRate(14_262_000, 11_880_000) * 100)).toBe(83);
    });
});

describe('the mirrored contract matches what the server actually returns', () => {
    it('exposes no appointment or patient fields on a visit', async () => {
        const visit = await moneyApi.visit('v-1');

        expect(visit).not.toHaveProperty('ref');
        expect(visit).not.toHaveProperty('startsAt');
        expect(visit).not.toHaveProperty('patientId');
        expect(visit).not.toHaveProperty('patientName');
    });

    it('returns the visits-row columns and the derived totals', async () => {
        const visit = await moneyApi.visit('v-1');

        expect(Object.keys(visit).sort()).toEqual(
            [
                'appointmentId',
                'balance',
                'chargedTotal',
                'checkedInAt',
                'completedAt',
                'computedTotal',
                'paidTotal',
                'payments',
                'id',
            ].sort(),
        );
    });

    it('still carries the reference and date on a balance row, where they exist', async () => {
        const [first] = await moneyApi.byPatient('p-1');

        expect(first?.ref).toBe('020526-K7QP');
        expect(first?.startsAt).toBe('2026-05-02T10:30:00.000Z');
    });
});

describe('currency position (§7.13)', () => {
    it('leads in English and trails in Arabic', () => {
        expect(currencyLeads('en')).toBe(true);
        expect(currencyLeads('ar')).toBe(false);
    });

    it('agrees with the single-string form, which is the reference order', () => {
        for (const locale of ['en', 'ar'] as const) {
            const whole = formatEgp(260_000, { locale });
            const figure = formatEgp(260_000, { locale, showCurrency: false });
            const currency = locale === 'ar' ? 'ج.م' : 'EGP';

            expect(whole).toBe(currencyLeads(locale) ? `${currency} ${figure}` : `${figure} ${currency}`);
        }
    });
});

describe('ordering the debtor list', () => {
    // Balances as the server derived them; the sort compares, never sums.
    const rows = [
        { name: 'Salma Adel', balance: 55_000, oldestUnpaidAt: '2026-08-08T15:10:00.000Z' },
        { name: 'Ahmed Zaki', balance: 1_200_000, oldestUnpaidAt: '2026-07-28T09:15:00.000Z' },
        { name: 'Nour El-Din Fathy', balance: 165_000, oldestUnpaidAt: '2026-01-14T16:45:00.000Z' },
    ];

    it('leads with the largest balance by default', () => {
        expect(sortDebtors(rows, 'balance').map((row) => row.name)).toEqual([
            'Ahmed Zaki',
            'Nour El-Din Fathy',
            'Salma Adel',
        ]);
    });

    it('leads with the longest-owed on "oldest", which is not the same order', () => {
        expect(sortDebtors(rows, 'oldest').map((row) => row.name)).toEqual([
            'Nour El-Din Fathy',
            'Ahmed Zaki',
            'Salma Adel',
        ]);
    });

    it('sorts by name without tripping over the hyphen', () => {
        expect(sortDebtors(rows, 'name').map((row) => row.name)).toEqual([
            'Ahmed Zaki',
            'Nour El-Din Fathy',
            'Salma Adel',
        ]);
    });

    it('does not reorder the callers array — the query owns it', () => {
        const original = [...rows];
        sortDebtors(rows, 'oldest');
        expect(rows).toEqual(original);
    });

    it('every mode is labelled, so the control can never render undefined', () => {
        for (const sort of DEBTOR_SORTS) {
            expect(DEBTOR_SORT_LABEL[sort]).toBeTruthy();
        }
    });
});

describe('the period labels read as the tail of both sentences', () => {
    it('names the takings card and the hero caption from one label', () => {
        expect(takingsLabel('This month')).toBe('Total collected this month');
        expect(takingsLabel('Today')).toBe('Total collected today');
        expect(takingsLabel('All time')).toBe('Total collected all time');

        expect(dueLabel('This month')).toBe('Due this month');
        expect(dueLabel('Today')).toBe('Due today');
    });

    it('heads the stats with the month being read, not the period selected', () => {
        expect(statsPeriodLabel(new Date('2026-06-15T10:00:00.000Z'))).toBe('Stats · June 2026');
    });
});

describe('a period that owes nothing', () => {
    // The hero draws a caption, an amount and a patient count. When the period
    // is square there is no amount to draw, and a zero under "Due this month"
    // beside "0 patients" reads as a broken figure rather than a settled one.
    const settled = (difference: number) =>
        amountStillDue(difference) === 0 && collectedAhead(difference) === 0;

    it('is settled when everything charged was collected', () => {
        expect(settled(0)).toBe(true);
    });

    it('is settled when nothing was charged at all — every day before the first visit', () => {
        expect(collectionRate(0, 0)).toBe(1);
        expect(settled(0)).toBe(true);
    });

    it('is not settled while anything is owed, or anything came in early', () => {
        expect(settled(2_382_000)).toBe(false);
        expect(settled(-120_000)).toBe(false);
    });
});
