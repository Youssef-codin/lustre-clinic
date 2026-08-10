// The one entry point. Screens import from `../api`, never from a file inside it.

export { ApiProvider, TRPCProvider, useTRPC, useTRPCClient } from './ApiProvider';
export { api, trpcClient } from './client';
export type { ServerAddresses } from './config';
export { serverAddresses, setServerAddresses, timing } from './config';
export type { AddressKind, ConnectionState, ConnectionStatus } from './connection';
export { getConnectionState, reprobe, ServerUnreachableError } from './connection';
export type { ApiFailure, FailureKind } from './errors';
export { classifyError, errorCodeOf, isOffline, isSlotOverlap } from './errors';
export { queryClient } from './queryClient';
export type { RouterInput, RouterOutput } from './types';
export type { Connection } from './useConnection';
export { useConnection } from './useConnection';
