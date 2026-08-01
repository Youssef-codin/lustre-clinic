import { existsSync, readFileSync } from 'node:fs';
import { fromAppRoot } from '../util/paths.ts';
import { type Config, configSchema } from './config.schema.ts';

export type { Config } from './config.schema.ts';

/**
 * A malformed config must fail at boot with a readable message — not surface as
 * a strange bug at 6pm when a reminder does not send. See spec §3.
 */
export class ConfigError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ConfigError';
    }
}

export function configPath(): string {
    return process.env.MAWID_CONFIG ?? fromAppRoot('config.json');
}

export function loadConfig(path = configPath()): Config {
    if (!existsSync(path)) {
        throw new ConfigError(
            `config.json not found at ${path}\n` +
                'Copy config.example.json to that location and fill it in for this clinic.',
        );
    }

    let raw: unknown;
    try {
        raw = JSON.parse(readFileSync(path, 'utf8'));
    } catch (err) {
        throw new ConfigError(`config.json at ${path} is not valid JSON\n  ${(err as Error).message}`);
    }

    const parsed = configSchema.safeParse(raw);
    if (!parsed.success) {
        const lines = parsed.error.issues.map((i) => `  • ${i.path.join('.') || '(root)'}: ${i.message}`);
        throw new ConfigError(`config.json at ${path} is invalid:\n${lines.join('\n')}`);
    }

    return parsed.data;
}

let current: Config | null = null;

/** Called once in `server.ts`, before anything else starts. */
export function setConfig(config: Config): Config {
    current = config;
    return config;
}

export function getConfig(): Config {
    if (!current) throw new Error('Config accessed before loadConfig() ran');
    return current;
}
