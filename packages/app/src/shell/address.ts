// The typing rules for the two server addresses, kept out of `SetupScreen` so
// they can be tested without a React Native runtime.

export interface ServerCandidate {
    lan: string;
    tailscale: string;
}

// Typed by a person setting up a phone, not pasted from a config file, so
// `192.168.1.20:3000` is accepted as readily as the full URL. Everything past
// that — the port, whether the host resolves — is the probe's to judge, which
// is why nothing here rejects: a value this cannot make sense of becomes an
// address that fails to answer, and the screen already says that well.
export function toBase(raw: string): string {
    const trimmed = raw.trim().replace(/\/+$/, '');
    if (!trimmed) return '';
    return /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
}

export function noAnswer(candidate: ServerCandidate): string {
    const both = candidate.lan && candidate.tailscale;
    const which = both ? 'Neither address answered' : 'That address did not answer';
    return `${which}. Check the clinic computer is on, that you are on the clinic wifi or signed in to Tailscale, and that the address ends in the port (:3000).`;
}
