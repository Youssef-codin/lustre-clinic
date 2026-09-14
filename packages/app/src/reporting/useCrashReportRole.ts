import type { ClientRole } from '@lustre/shared';
// biome-ignore lint/style/noRestrictedImports: writes the role onto the crash reporter's scope, which lives outside React
import { useEffect } from 'react';
import { tagRole } from './reporting';

/** The role as a tag on every report (§17). A preference, not an identity: there is no user to send. */
export function useCrashReportRole(role: ClientRole): void {
    useEffect(() => {
        tagRole(role);
    }, [role]);
}
