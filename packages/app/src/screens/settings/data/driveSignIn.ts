/**
 * SPEC §16 — linking the clinic's off-site backups to a Google account from the
 * phone, which is the one thing in this app that changes where patient data
 * goes.
 *
 * The refresh token never touches the handset. The browser hands back an
 * authorization code, the code goes to the server, and the server exchanges it
 * for the token it will keep. A code is single-use and worthless without the
 * verifier that produced it, so nothing durable is exposed if this call is seen.
 *
 * The client is an Android OAuth client, which Google issues without a secret —
 * PKCE is what stands in for one, and `expo-auth-session` generates the
 * verifier and challenge.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as AuthSession from 'expo-auth-session';
import { useTRPC } from '../../../api';
import { getLocale } from '../../../i18n/runtime';

const DISCOVERY: AuthSession.DiscoveryDocument = {
    authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenEndpoint: 'https://oauth2.googleapis.com/token',
};

type DriveSignInResult =
    | { kind: 'linked'; account: string | null }
    | { kind: 'cancelled' }
    | { kind: 'failed'; code: string };

export function useDriveSignIn() {
    const trpc = useTRPC();
    const queryClient = useQueryClient();

    const link = useMutation(trpc.backup.linkDrive.mutationOptions());

    async function signIn(): Promise<DriveSignInResult> {
        let config: { clientId: string; redirectUri: string; scope: string };
        try {
            config = await queryClient.fetchQuery(trpc.backup.signInConfig.queryOptions());
        } catch (error) {
            return { kind: 'failed', code: codeOf(error) };
        }

        const request = new AuthSession.AuthRequest({
            clientId: config.clientId,
            redirectUri: config.redirectUri,
            scopes: [config.scope],
            usePKCE: true,
            // Without `access_type` Google returns an access token only, and the
            // server has nothing to mint tomorrow night's upload with. `hl` keeps
            // Google's own screens in the app's language: they otherwise follow
            // the Google account, which on a clinic phone is often not Arabic.
            extraParams: { access_type: 'offline', prompt: 'consent', hl: getLocale() },
        });

        const result = await request.promptAsync(DISCOVERY);
        if (result.type !== 'success') return { kind: 'cancelled' };
        if (!request.codeVerifier) return { kind: 'failed', code: 'INTERNAL' };

        try {
            const linked = await link.mutateAsync({
                code: result.params.code ?? '',
                codeVerifier: request.codeVerifier,
            });
            await queryClient.invalidateQueries({ queryKey: trpc.backup.status.queryKey() });
            return { kind: 'linked', account: linked.account };
        } catch (error) {
            return { kind: 'failed', code: codeOf(error) };
        }
    }

    return { signIn, linking: link.isPending };
}

function codeOf(error: unknown): string {
    const shape = error as { data?: { appCode?: string } } | null;
    return shape?.data?.appCode ?? 'INTERNAL';
}
