/**
 * The connection as settings draws it. `api/useConnection` reports the state —
 * probing, online on which address, offline — and `settings.html` names three
 * of those to the user: on the clinic's own wifi the phone talks to the server
 * directly, off it the same server over the tailnet, and neither is "Offline".
 * That is `address`, not a separate setting: the app has one server and picks
 * the route itself, which is why the App pane offers a re-probe and no picker.
 *
 * Probing keeps the label it had rather than flashing a fourth state through
 * the card on every re-probe — the spinner on the button is what says the app
 * is working. Only a settled answer changes the words.
 */
import { useRef } from 'react';
import { serverAddresses, useConnection } from '../../../api';
import type { DotTone } from '../../../components/ui';
import { formatStamp } from '../components/_LocalClock';

export type ConnectionKind = 'wifi' | 'remote' | 'offline';

export interface ConnectionView {
    kind: ConnectionKind;
    /** "Clinic wifi" · "Remote" · "Offline" — the card's one-line status. */
    label: string;
    tone: DotTone;
    pulse: boolean;
    /** The server itself, which is the same box on both routes. */
    serverName: string;
    serverAddress: string;
    /** "Last checked 11:14 AM", or undefined before the first answer. */
    stamp: string | undefined;
    probing: boolean;
    reprobe: () => void;
}

const LABEL: Record<ConnectionKind, string> = {
    wifi: 'Clinic wifi',
    remote: 'Remote',
    offline: 'Offline',
};

const TONE: Record<ConnectionKind, DotTone> = {
    wifi: 'wa',
    remote: 'accent',
    offline: 'due',
};

// Remote is the steady one: it is working, just over the internet. The other
// two pulse because both are worth a second glance — one says "you are on the
// clinic's own network", the other says "nothing is reaching the server".
const PULSE: Record<ConnectionKind, boolean> = {
    wifi: true,
    remote: false,
    offline: true,
};

export function useConnectionView(): ConnectionView {
    const { status, address, lastOnlineAt, retry } = useConnection();

    const settled = useRef<ConnectionKind>('offline');
    if (status === 'online') settled.current = address === 'tailscale' ? 'remote' : 'wifi';
    else if (status === 'offline') settled.current = 'offline';

    const kind = settled.current;
    const { lan, tailscale } = serverAddresses();

    return {
        kind,
        label: LABEL[kind],
        tone: TONE[kind],
        pulse: PULSE[kind],
        serverName: 'Clinic server',
        serverAddress: (kind === 'remote' ? tailscale : lan) ?? lan ?? tailscale ?? '—',
        stamp: lastOnlineAt === null ? undefined : `Last checked ${formatStamp(lastOnlineAt)}`,
        probing: status === 'probing',
        reprobe: () => void retry(),
    };
}
