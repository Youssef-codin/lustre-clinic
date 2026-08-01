import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ConfigProvider } from './contexts/ConfigContext.tsx';
import { initialLocale, LocaleProvider } from './contexts/LocaleContext.tsx';
import { SocketProvider } from './contexts/SocketContext.tsx';
import { applyLocaleToDocument } from './i18n/index.ts';
import './styles.css';

// Before the first render, so an English device never flashes RTL Arabic.
// This runs in the module rather than an inline script — the CSP has no
// 'unsafe-inline' for scripts.
applyLocaleToDocument(initialLocale);

const container = document.getElementById('root');
if (!container) throw new Error('#root missing from index.html');

createRoot(container).render(
    <StrictMode>
        <LocaleProvider>
            <ConfigProvider>
                <SocketProvider>
                    <App />
                </SocketProvider>
            </ConfigProvider>
        </LocaleProvider>
    </StrictMode>,
);
