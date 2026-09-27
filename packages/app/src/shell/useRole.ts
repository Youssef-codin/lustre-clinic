import { useCredential } from '../api';
import { type PhoneRole, resolveRole, useAdminView, useLegacyRole } from './roleStore';

/** Which view this phone draws and which role it was granted (`roleStore`). */
export function useRole(): PhoneRole {
    const legacy = useLegacyRole();
    const admin = useAdminView();
    const { hydrated, credential } = useCredential();
    return resolveRole(legacy, admin, credential, hydrated);
}
