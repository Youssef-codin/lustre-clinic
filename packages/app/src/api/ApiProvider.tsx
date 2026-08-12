import type { AppRouter } from '@lustre/server/src/trpc/router.ts';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTRPCContext } from '@trpc/tanstack-react-query';
import type { ReactNode } from 'react';
import { trpcClient } from './client';
import { useServerEvents } from './live';
import { queryClient } from './queryClient';

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
