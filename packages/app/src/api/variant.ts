// Which kind of build this is, and what each kind may do. Pure, so `bun test`
// reaches it; `config.ts` supplies the inputs from the running build.
//
// The signal is `__DEV__`, not a value in `app.json`. Metro sets it false in
// every release bundle whatever the config says, so a clinic's APK cannot be a
// dev build by somebody forgetting to flip a flag. A release build that ships
// `extra.demo: true` is the demo handed to someone across a table, which is a
// deliberate build of its own and still not the clinic's app.
import type { ServerAddresses } from './config';

export type BuildVariant = 'dev' | 'demo' | 'prod';

export function variantOf(build: { dev: boolean; shippedDemo: boolean }): BuildVariant {
    if (build.dev) return 'dev';
    return build.shippedDemo ? 'demo' : 'prod';
}

// The clinic server listens only on Tailscale, and its firewall drops the API
// port from the wifi, so a LAN address can never answer a prod build. It would
// only cost a probe that always fails. Development keeps it: the emulator and a
// cable-attached phone reach the dev server through `localhost`.
export function allowsLan(variant: BuildVariant): boolean {
    return variant !== 'prod';
}

// Demo mode on a clinic phone is a fake register one tap from the real one.
export function allowsDemo(variant: BuildVariant): boolean {
    return variant !== 'prod';
}

export function usableAddresses(variant: BuildVariant, addresses: ServerAddresses): ServerAddresses {
    return allowsLan(variant) ? addresses : { ...addresses, lan: null };
}
