import { printDayQuerySchema, printSlipParamSchema } from '@mawid/shared';
import type { ValidationSpec } from '../../middleware/validate.ts';

export const printSlipSpec = { params: printSlipParamSchema } satisfies ValidationSpec;
export const printDaySpec = { query: printDayQuerySchema } satisfies ValidationSpec;
