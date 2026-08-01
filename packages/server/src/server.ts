import { createServer } from 'node:http';
import { createApp } from './app.ts';
import { ConfigError, configPath, loadConfig, setConfig } from './config/index.ts';
import { closeDb, openDb } from './db/index.ts';
import { logger } from './middleware/logger.ts';
import { startPrinter } from './services/printer/index.ts';
import { startReminders, stopReminders } from './services/reminders/index.ts';
import { startWhatsApp, stopWhatsApp } from './services/whatsapp/index.ts';
import { VERSION } from './version.ts';
import { attachWebSocket, closeWebSocket } from './ws/index.ts';

async function main(): Promise<void> {
    // 1. Config first — a bad config must stop the boot, loudly.
    const config = setConfig(loadConfig());
    logger.info({ version: VERSION, config: configPath(), clinic: config.clinic.nameEn }, 'starting mawid');

    // 2. Database and migrations, before anything that reads data starts.
    openDb(config.database);

    // 3. Long-running services (printer, whatsapp, reminders, backups) go here —
    //    each flipping its own entry in services/status.ts.
    await startPrinter(config);
    await startWhatsApp(config);
    startReminders();

    // 4. HTTP + websocket on one port.
    const app = createApp();
    const server = createServer(app);
    attachWebSocket(server);

    server.listen(config.server.port, config.server.host, () => {
        logger.info(
            { host: config.server.host, port: config.server.port },
            `listening on http://${config.hostname}:${config.server.port}`,
        );
    });

    const shutdown = async (signal: string) => {
        logger.info({ signal }, 'shutting down');
        await closeWebSocket();
        stopReminders();
        await stopWhatsApp();
        closeDb();
        server.close(() => process.exit(0));
        // Don't let a hung connection keep the clinic PC's port bound.
        setTimeout(() => process.exit(0), 5_000).unref();
    };

    process.on('SIGINT', () => void shutdown('SIGINT'));
    process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err: unknown) => {
    if (err instanceof ConfigError) {
        logger.fatal(`\n${err.message}\n`);
    } else {
        logger.fatal({ err }, 'failed to start');
    }
    process.exit(1);
});
