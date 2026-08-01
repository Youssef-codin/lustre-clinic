/**
 * The printer model at each clinic is unknown until install, so printing is
 * swappable by config and never by code change — spec §7.
 */
import type { PrintJobTarget } from '@mawid/shared';

export interface PrintJob {
    /** Filename and log handle. Carries no patient data. */
    id: string;
    /**
     * What this job prints, in the form the desk banner's reprint button needs —
     * each variant maps onto exactly one endpoint.
     */
    target: PrintJobTarget;
    /**
     * Rendered on every attempt rather than once. Nothing about a print job is
     * worth storing — everything printable is derivable from the appointment,
     * so a reprint is just another render. See spec §7.
     */
    render: () => Promise<Uint8Array>;
}

export interface PrintDriver {
    readonly name: string;
    /** Checked at boot and before a retry, so a printer switched off is visible. */
    available: () => Promise<boolean>;
    print: (job: PrintJob) => Promise<void>;
}
