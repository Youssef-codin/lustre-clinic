import type { ProcedureRecorder } from '@lustre/shared';
import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '../../api';

/**
 * The clinic's answer to who records procedures, through React Query rather
 * than this cluster's local layer: `/ws` invalidates the settings query, so a
 * change made on the doctor's phone reaches the desk without a pull. Undefined
 * until it lands, and on a server that predates the setting.
 */
export function useProcedureRecorder(): ProcedureRecorder | undefined {
    const trpc = useTRPC();
    return useQuery(trpc.settings.get.queryOptions()).data?.proceduresRecordedBy;
}
