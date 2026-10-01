import { api } from './day';
import { useLocalQuery } from './hooks';

/** False until the settings arrive, so a dental clinic never loses a word it needs. */
export function useGeneralProcedures(): boolean {
    return useLocalQuery('settings', api.settings).data?.generalProcedures ?? false;
}
