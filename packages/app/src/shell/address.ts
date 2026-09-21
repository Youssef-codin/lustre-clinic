// The typing rules for the server addresses, kept out of `SetupScreen` so they
// can be tested without a React Native runtime.

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

// A prod build draws no LAN field, but the rule is applied here as well as in
// the layout: what this returns is what gets probed and saved, and a LAN value
// still sitting in the screen's state from a stored address must not ride along.
export function toCandidate(typed: ServerCandidate, lanAllowed: boolean): ServerCandidate {
    return { lan: lanAllowed ? toBase(typed.lan) : '', tailscale: toBase(typed.tailscale) };
}

// Said before probing, because a wifi address typed into the one field a prod
// build has would otherwise fail as "did not answer" — true, and no help.
export const NOT_ON_TAILNET =
    "That is not a Tailscale address. Use the clinic computer's name ending in .ts.net, or its 100.x address.";

export function nothingEntered(lanAllowed: boolean): string {
    return lanAllowed ? 'Enter at least one address.' : 'Enter the Tailscale address.';
}

/** Two English sentences rather than one assembled from three fragments, so
 * each is a whole key the catalogue can translate as a sentence. */
export function noAnswer(candidate: ServerCandidate): string {
    const both = candidate.lan && candidate.tailscale;
    if (both) {
        return 'Neither address answered. Check the clinic computer is on, that you are on the clinic wifi or signed in to Tailscale, and that the address ends in the port (:3000).';
    }
    return candidate.lan
        ? 'That address did not answer. Check the clinic computer is on, that you are on the clinic wifi or signed in to Tailscale, and that the address ends in the port (:3000).'
        : 'That address did not answer. Check the clinic computer is on, that you are signed in to Tailscale, and that the address ends in the port (:3000).';
}
