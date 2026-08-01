import { remindersQuerySchema } from '@mawid/shared';
import type { ValidationSpec } from '../../middleware/validate.ts';

export const listRemindersSpec = { query: remindersQuerySchema } satisfies ValidationSpec;
