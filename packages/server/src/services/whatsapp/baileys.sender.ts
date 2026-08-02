import { mkdirSync, rmSync } from 'node:fs';
import makeWASocket, {
    Browsers,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    useMultiFileAuthState,
} from '@whiskeysockets/baileys';
import type { Config } from '../../config/index.ts';
import { logger } from '../../middleware/logger.ts';
import { resolveConfigured } from '../../util/paths.ts';
import { renderPairingQr } from './qr.ts';
import type { MessageSender } from './sender.ts';
import { toWhatsAppJid } from './sender.ts';
import { getWhatsAppState, setWhatsAppState } from './state.ts';

/**
 * The Baileys socket. Runs on a dedicated number, never the clinic's main line —
 * a restricted number must degrade to "reminders are late", not "patients cannot
 * reach the clinic". See spec §8.
 *
 * The socket *will* drop; that is normal operation, not an error. Every close is
 * reconnected with backoff except a logout, which is the one case where
 * reconnecting is pointless — the credentials are gone and someone has to scan
 * a QR at the clinic.
 */

const RECONNECT_BASE_MS = 2_000;
const RECONNECT_MAX_MS = 60_000;

type Socket = ReturnType<typeof makeWASocket>;

/**
 * Baileys reports why a socket closed as a Boom error. Only the status code
 * matters here, so it is read structurally rather than pulling in `@hapi/boom`
 * for one field.
 */
function disconnectStatus(error: unknown): number | undefined {
    return (error as { output?: { statusCode?: number } } | undefined)?.output?.statusCode;
}

export async function baileysSender(config: Config): Promise<MessageSender> {
    const sessionPath = resolveConfigured(config.whatsapp.sessionPath);
    mkdirSync(sessionPath, { recursive: true });

    let socket: Socket | null = null;
    let attempts = 0;
    let stopped = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    /**
     * Bumped every time the pairing state moves. Rendering a QR to an image is
     * async and WhatsApp reissues the code every ~20s, so a slow render that
     * lands after the next code arrived would put a dead QR on the desk screen —
     * one nobody can pair with and which looks like the system is broken.
     */
    let pairing = 0;

    /** Session credentials live here and are included in backups (§11) —
     *  losing them means re-scanning a QR at the clinic. */
    const { state: auth, saveCreds } = await useMultiFileAuthState(sessionPath);

    const connect = async (): Promise<void> => {
        if (stopped) return;

        const { version } = await fetchLatestBaileysVersion();

        socket = makeWASocket({
            version,
            auth: {
                creds: auth.creds,
                keys: makeCacheableSignalKeyStore(auth.keys, logger as never),
            },
            // Names the entry in the phone's "Linked devices" list. The clinic
            // has to recognise this months later to know which session to leave
            // alone — the default is a generic browser name.
            browser: Browsers.ubuntu('Mawid'),
            markOnlineOnConnect: false,
            logger: logger as never,
        });

        socket.ev.on('creds.update', () => void saveCreds());

        socket.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                pairing += 1;
                const seq = pairing;
                // Rendered to an image here rather than in the browser; the desk
                // shows a picture, not a string of base64 nobody can scan.
                void renderPairingQr(qr).then((image) => {
                    if (seq === pairing) setWhatsAppState({ connected: false, qr: image });
                });
            }

            if (connection === 'open') {
                attempts = 0;
                pairing += 1;
                setWhatsAppState({ connected: true, qr: undefined, lastError: undefined });
                logger.info('whatsapp connected');
                return;
            }

            if (connection !== 'close') return;

            const status = disconnectStatus(lastDisconnect?.error);
            const loggedOut = status === DisconnectReason.loggedOut;

            // The code on screen died with the socket. Showing "waiting for a
            // pairing code" for a few seconds is better than leaving up one that
            // will never pair.
            pairing += 1;
            setWhatsAppState({
                connected: false,
                qr: undefined,
                lastError: loggedOut ? 'logged out — scan the pairing QR again' : `disconnected (${status})`,
            });

            if (loggedOut) {
                // Reconnecting with dead credentials just loops. The desk shows
                // the state and someone at the clinic re-pairs.
                logger.error('whatsapp logged out — pairing required');
                return;
            }

            scheduleReconnect();
        });
    };

    /** Exponential backoff, capped. A tight reconnect loop is itself a reason
     *  for WhatsApp to restrict a number. */
    const scheduleReconnect = (): void => {
        if (stopped || reconnectTimer) return;

        attempts += 1;
        const delay = Math.min(RECONNECT_BASE_MS * 2 ** (attempts - 1), RECONNECT_MAX_MS);
        logger.warn({ attempts, delay }, 'whatsapp disconnected — reconnecting');

        reconnectTimer = setTimeout(() => {
            reconnectTimer = null;
            connect().catch((err: unknown) => {
                logger.error({ err }, 'whatsapp reconnect failed');
                scheduleReconnect();
            });
        }, delay);
        reconnectTimer.unref?.();
    };

    await connect();

    return {
        name: 'baileys',

        async send(to: string, text: string) {
            if (!socket || !getWhatsAppState().connected) {
                throw new Error('WhatsApp is not connected');
            }

            const jid = toWhatsAppJid(to);

            /**
             * A number that is not on WhatsApp accepts a message into nothing:
             * the send resolves, the row is marked `sent`, and the patient is
             * never told. Failing here instead puts them on the desk's "not
             * reminded" list, which is the whole point of that list — someone
             * picks up the phone. Plenty of Egyptian landlines and second SIMs
             * have no WhatsApp on them, so this is the normal case, not an edge.
             */
            const [registered] = (await socket.onWhatsApp(jid)) ?? [];

            // A failed lookup is not proof of absence — only an explicit `false`
            // is. Refusing to send because a query timed out would silence
            // reminders for patients who are reachable.
            if (registered && !registered.exists) {
                throw new Error('That number is not on WhatsApp — call the patient instead');
            }

            await socket.sendMessage(registered?.jid ?? jid, { text });
        },

        status: getWhatsAppState,

        async logout() {
            try {
                await socket?.logout();
            } finally {
                // Credentials are dead either way; leaving them behind means the
                // next start silently retries a session that cannot work.
                rmSync(sessionPath, { recursive: true, force: true });
                mkdirSync(sessionPath, { recursive: true });
                setWhatsAppState({ connected: false, qr: undefined, lastError: 'logged out' });
            }
        },

        async stop() {
            stopped = true;
            if (reconnectTimer) clearTimeout(reconnectTimer);
            socket?.end(undefined);
            setWhatsAppState({ connected: false });
        },
    };
}
