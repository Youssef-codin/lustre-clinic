import type { WhatsAppStatus } from '@mawid/shared';
import { useState } from 'react';
import { useI18n } from '../contexts/LocaleContext.tsx';
import { useServerEvent } from '../contexts/SocketContext.tsx';
import { api } from '../lib/api.ts';
import { localizeError } from '../lib/errorMessage.ts';

/**
 * Linking is done from the desk, not from the server console — the person who
 * has to hold a phone up to the pairing QR is standing at the front desk in a
 * clinic you are not in (spec §8).
 *
 * Quiet when there is nothing to do. Loud when the socket is down, because a
 * dead WhatsApp connection means no patient gets reminded and nothing else in
 * the system will say so.
 */
export function WhatsAppPanel({ fetched }: { fetched: WhatsAppStatus | null }) {
    const { t } = useI18n();
    const [live, setLive] = useState<WhatsAppStatus | null>(null);
    const [confirming, setConfirming] = useState(false);
    const [unlinking, setUnlinking] = useState(false);
    const [error, setError] = useState<unknown>(null);

    useServerEvent('whatsapp:status', setLive);

    const status = live ?? fetched;
    if (!status) return null;

    const unlink = async () => {
        setUnlinking(true);
        setError(null);
        try {
            setLive(await api.post<WhatsAppStatus>('/api/whatsapp/logout'));
            setConfirming(false);
        } catch (err: unknown) {
            setError(err);
        } finally {
            setUnlinking(false);
        }
    };

    // The QR is an image the server rendered; it already has `qrcode` installed
    // for printing. If it arrives as raw pairing text instead, show the text
    // rather than a broken image — the web app should not ship a second QR
    // encoder to redraw something the server can already produce.
    const qrIsImage = status.qr?.startsWith('data:') ?? false;

    if (status.connected) {
        return (
            <div className="mb-6 flex flex-wrap items-center gap-3 text-sm">
                <span className="rounded-full bg-emerald-100 px-2.5 py-1 font-medium text-emerald-800">
                    {t('whatsapp.heading')} · {t('whatsapp.linked')}
                </span>

                {status.dryRun && (
                    <span className="rounded-full bg-amber-100 px-2.5 py-1 font-medium text-amber-900">
                        {t('whatsapp.dryRun')}
                    </span>
                )}

                {confirming ? (
                    <>
                        <span className="text-slate-600">{t('whatsapp.unlinkConfirm')}</span>
                        <button
                            type="button"
                            onClick={unlink}
                            disabled={unlinking}
                            className="h-9 rounded-lg bg-rose-600 px-3 font-medium text-white disabled:bg-slate-300"
                        >
                            {unlinking ? t('whatsapp.unlinking') : t('whatsapp.unlink')}
                        </button>
                        <button
                            type="button"
                            onClick={() => setConfirming(false)}
                            className="h-9 rounded-lg border border-slate-300 px-3 font-medium text-slate-700"
                        >
                            {t('book.cancel')}
                        </button>
                    </>
                ) : (
                    <button
                        type="button"
                        onClick={() => setConfirming(true)}
                        className="text-slate-500 underline underline-offset-4 hover:text-slate-700"
                    >
                        {t('whatsapp.unlink')}
                    </button>
                )}

                {error != null && (
                    <span className="text-rose-700">
                        {t('whatsapp.unlinkFailed', { message: localizeError(t, error) })}
                    </span>
                )}
            </div>
        );
    }

    return (
        <section role="alert" className="mb-6 rounded-lg border border-rose-300 bg-rose-50 p-4">
            <h2 className="font-semibold text-rose-900">
                {t('whatsapp.heading')} · {t('whatsapp.notLinked')}
            </h2>
            <p className="mt-1 text-sm text-rose-800">{t('whatsapp.scanToLink')}</p>

            {status.lastError && (
                <p className="mt-2 font-mono text-xs text-slate-500" dir="ltr">
                    {t('whatsapp.lastError', { message: status.lastError })}
                </p>
            )}

            <div className="mt-3">
                {status.qr && qrIsImage && (
                    // White plate: a QR on a tinted background is unreliable to scan.
                    <img
                        src={status.qr}
                        alt={t('whatsapp.scanToLink')}
                        className="h-56 w-56 rounded-lg bg-white p-2 shadow-sm"
                    />
                )}

                {status.qr && !qrIsImage && (
                    <div>
                        <p className="mb-1 text-sm text-slate-600">{t('whatsapp.qrRaw')}</p>
                        <code className="block overflow-x-auto rounded-md bg-white px-3 py-2 font-mono text-xs">
                            {status.qr}
                        </code>
                    </div>
                )}

                {!status.qr && <p className="text-sm text-slate-600">{t('whatsapp.qrUnavailable')}</p>}
            </div>
        </section>
    );
}
