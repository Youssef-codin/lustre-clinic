import type { AppRouter } from '@mawid/server/src/trpc/router.ts';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTRPCContext } from '@trpc/tanstack-react-query';
import type { ReactNode } from 'react';
import { trpcClient } from './client';
import { useServerEvents } from './live';
import { queryClient } from './queryClient';

/**
 * The one provider the app shell mounts. Everything below it can call the
 * server:
 *
 *     <ApiProvider>
 *         <Navigation />
 *     </ApiProvider>
 *
 * `useTRPC()` returns the typed options proxy; pass what it gives you straight
 * to `useQuery` or `useMutation`.
 */

export const { TRPCProvider, useTRPC, useTRPCClient } = createTRPCContext<AppRouter>();

function ServerEvents({ children }: { children: ReactNode }) {
    useServerEvents();
    return <>{children}</>;
}

export function ApiProvider({ children }: { children: ReactNode }) {
    return (
        <QueryClientProvider client={queryClient}>
            <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
                <ServerEvents>{children}</ServerEvents>
            </TRPCProvider>
        </QueryClientProvider>
    );
}
