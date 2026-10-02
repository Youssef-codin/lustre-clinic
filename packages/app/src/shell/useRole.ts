import { useCredential, useDeviceBackend } from '../api';
import { type PhoneRole, resolveRole, useAdminView, useLegacyRole } from './roleStore';

/** Which view this phone draws and which role it was granted (`roleStore`). */
export function useRole(): PhoneRole {
    const legacy = useLegacyRole();
    const admin = useAdminView();
    const { hydrated, credential } = useCredential();
    const resolved = resolveRole(legacy, admin, credential, hydrated);
    // A clinic on one phone has no doctor's phone and no desk's: this one does
    // both, and only the desk's day books, checks in and takes payment.
    const local = useDeviceBackend().backend === 'local';
    return local ? { ...resolved, role: 'secretary' } : resolved;
}
