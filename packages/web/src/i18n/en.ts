import type { Dictionary } from './index.ts';

export const en: Dictionary = {
    'app.name': 'Mawid',

    'locale.switch': 'العربية',
    'locale.switchLabel': 'Change language',

    'status.heading': 'System status',
    'status.socket': 'Live connection',
    'status.db': 'Database',
    'status.printer': 'Printer',
    'status.whatsapp': 'WhatsApp',
    'status.ok': 'Working',
    'status.degraded': 'Degraded',
    'status.down': 'Down',
    'status.disabled': 'Not enabled',
    'status.meta': 'Version {version} · up {uptime}s',

    'appointmentTypes.heading': 'Appointment types',
    'appointmentTypes.minutes': '{minutes} min',

    'config.loadFailed': 'Could not load clinic settings: {message}',

    'error.BAD_REQUEST': 'Invalid request.',
    'error.VALIDATION_FAILED': 'Please check the details you entered.',
    'error.NOT_FOUND': 'Not found.',
    'error.INTERNAL': 'Something went wrong.',
    'error.SLOT_TAKEN': 'That time is already booked.',
    'error.PATIENT_NOT_FOUND': 'Patient not found.',
    'error.APPOINTMENT_NOT_FOUND': 'Appointment not found.',
    'error.OUTSIDE_WORKING_HOURS': 'That time is outside working hours.',
    'error.PRINTER_UNAVAILABLE': 'The printer is unavailable.',
    'error.WHATSAPP_DISCONNECTED': 'WhatsApp is disconnected.',
};
