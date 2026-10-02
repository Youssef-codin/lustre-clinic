import { api } from './day';
import { useLocalQuery } from './hooks';

/**
 * Whether this is a general (not dental) clinic. False until the settings
 * arrive, so a dental clinic never loses a word it needs.
 */
export function useGeneralClinic(): boolean {
    return useLocalQuery('settings', api.settings).data?.clinicType === 'general';
}
