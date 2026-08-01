import { slotsQuerySchema } from '@mawid/shared';
import type { ValidationSpec } from '../../middleware/validate.ts';

export const findSlotsSpec = { query: slotsQuerySchema } satisfies ValidationSpec;
