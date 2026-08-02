import type { AppointmentStatus, Locale } from '@mawid/shared';

/**
 * Labels for printed output only. Kept here rather than shared with the web
 * app's i18n because paper and screen are not the same product — the slip says
 * "Booked:" next to a blank line for a signature, which no screen ever needs —
 * and because `packages/web` is another session's package.
 */

interface PrintLabels {
    slipTitle: string;
    patient: string;
    phone: string;
    date: string;
    time: string;
    duration: string;
    minutes: string;
    reason: string;
    fileNo: string;
    ref: string;
    /** Only ever printed on a reprint — a fresh slip is always `booked`. */
    statuses: Record<AppointmentStatus, string>;
    note: string;
    bookedBy: string;
    daySchedule: string;
    columnTime: string;
    columnPatient: string;
    columnPhone: string;
    columnType: string;
    columnNotes: string;
    noAppointments: string;
    printedAt: string;
    scanHint: string;
    page: string;
    of: string;
}

const AR: PrintLabels = {
    slipTitle: 'إيصال حجز',
    patient: 'المريض',
    phone: 'التليفون',
    date: 'التاريخ',
    time: 'الوقت',
    duration: 'المدة',
    minutes: 'دقيقة',
    reason: 'سبب الزيارة',
    fileNo: 'رقم الملف',
    ref: 'رقم الحجز',
    statuses: {
        booked: 'محجوز',
        done: 'تم الكشف',
        cancelled: 'ملغي',
        no_show: 'لم يحضر',
    },
    note: 'ملاحظات',
    bookedBy: 'تم الحجز بواسطة',
    daySchedule: 'مواعيد اليوم',
    columnTime: 'الوقت',
    columnPatient: 'المريض',
    columnPhone: 'التليفون',
    columnType: 'نوع الكشف',
    columnNotes: 'ملاحظات الطبيب',
    noAppointments: 'لا توجد مواعيد في هذا اليوم',
    printedAt: 'طُبع في',
    scanHint: 'امسح الكود لعرض موعدك',
    page: 'صفحة',
    of: 'من',
};

const EN: PrintLabels = {
    slipTitle: 'Booking slip',
    patient: 'Patient',
    phone: 'Phone',
    date: 'Date',
    time: 'Time',
    duration: 'Duration',
    minutes: 'min',
    reason: 'Reason for visit',
    fileNo: 'File no.',
    ref: 'Ref',
    statuses: {
        booked: 'Booked',
        done: 'Completed',
        cancelled: 'Cancelled',
        no_show: 'No-show',
    },
    note: 'Note',
    bookedBy: 'Booked by',
    daySchedule: 'Today’s schedule',
    columnTime: 'Time',
    columnPatient: 'Patient',
    columnPhone: 'Phone',
    columnType: 'Type',
    columnNotes: 'Doctor’s notes',
    noAppointments: 'No appointments this day',
    printedAt: 'Printed',
    scanHint: 'Scan to view your appointment',
    page: 'Page',
    of: 'of',
};

export function printLabels(locale: Locale): PrintLabels {
    return locale === 'en' ? EN : AR;
}
