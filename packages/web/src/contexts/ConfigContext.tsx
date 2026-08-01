import type { PublicConfig } from '@mawid/shared';
import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';
import { storedLocale } from '../i18n/index.ts';
import { loadConfig } from '../lib/config.ts';
import { useI18n } from './LocaleContext.tsx';

interface ConfigState {
    config: PublicConfig | null;
    /** Kept as the thrown error, not a string — the UI localizes it by code. */
    error: Error | null;
}

const ConfigContext = createContext<ConfigState>({ config: null, error: null });

/** Clinic name, hours and appointment types. Nothing clinic-specific is in source. */
export function ConfigProvider({ children }: { children: ReactNode }) {
    const [state, setState] = useState<ConfigState>({ config: null, error: null });
    const { setLocale } = useI18n();

    useEffect(() => {
        let cancelled = false;

        loadConfig()
            .then((config) => {
                if (cancelled) return;
                setState({ config, error: null });
                // A device that has never chosen follows the clinic's default;
                // one that has chosen keeps its choice.
                if (!storedLocale()) setLocale(config.defaultLocale, false);
            })
            .catch((err: Error) => !cancelled && setState({ config: null, error: err }));

        return () => {
            cancelled = true;
        };
    }, [setLocale]);

    return <ConfigContext.Provider value={state}>{children}</ConfigContext.Provider>;
}

export function useConfig(): ConfigState {
    return useContext(ConfigContext);
}
