/**
 * SPEC §4: do not log patient names, phone numbers, notes, or amounts. IDs and
 * error codes only. The redaction list below is a backstop, not a licence to
 * pass patient data to the logger.
 */
import { pino } from 'pino';
import { config } from './config.ts';

export const logger = pino({
    level: config.LOG_LEVEL,
    redact: {
        paths: [
            'name',
            'phone',
            'email',
            'note',
            'notes',
            'custom',
            'amount',
            'chargedTotal',
            'computedTotal',
            '*.name',
            '*.phone',
            '*.email',
            '*.note',
            '*.notes',
            '*.custom',
            '*.amount',
        ],
        censor: '[redacted]',
    },
    transport:
        config.NODE_ENV === 'development'
            ? { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } }
            : undefined,
});
