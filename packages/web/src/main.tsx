import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ConfigProvider } from './contexts/ConfigContext.tsx';
import { initialLocale, LocaleProvider } from './contexts/LocaleContext.tsx';
import { SocketProvider } from './contexts/SocketContext.tsx';
import { applyLocaleToDocument } from './i18n/index.ts';
import { router } from './router.ts';
import './styles.css';

// Before the first render, so an English device never flashes RTL Arabic.
// This runs in the module rather than an inline script — the CSP has no
// 'unsafe-inline' for scripts.
applyLocaleToDocument(initialLocale);

// Before anything fetches. Dropped entirely from a production build — see the
// `define` in build.ts — and deleted outright once the server has these routes.
if (process.env.NODE_ENV !== 'production') {
    const { installMockApi } = await import('./mocks/index.ts');
    await installMockApi();
}

const container = document.getElementById('root');
if (!container) throw new Error('#root missing from index.html');

// The providers sit outside the router, not in a route: one websocket and one
// config fetch for the life of the tab, surviving every navigation.
createRoot(container).render(
    <StrictMode>
        <LocaleProvider>
            <ConfigProvider>
                <SocketProvider>
                    <RouterProvider router={router} />
                </SocketProvider>
            </ConfigProvider>
        </LocaleProvider>
    </StrictMode>,
);
