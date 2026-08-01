# Mawid

Clinic appointment booking with WhatsApp reminders and printed paper output.
See [SPEC.MD](./SPEC.MD) for the full design, and [DEMO.md](./DEMO.md) for the
feature walkthrough — what to show, in what order, and what to say.

## Setup

```bash
bun install
cp config.example.json packages/server/config.json   # edit for the clinic
```

`config.json` is gitignored — nothing clinic-specific belongs in source.

## Running

```bash
bun run dev        # frontend watch-build + server with --watch, one port
```

Then open <http://localhost:8080>. The frontend builds into
`packages/server/public/`, which the server serves statically — so the desk, a
phone on the LAN, and the compiled binary all hit the same origin and every
`fetch` in the app stays relative.

Individually:

```bash
bun run --cwd packages/web  dev     # rebuild on change
bun run --cwd packages/server dev   # bun --watch
```

## Checks

```bash
bun run typecheck
bun run lint        # bun run lint:fix to apply
bun run format
bun test
```

## Languages

Arabic and English, switchable from the toggle in the header. Direction flips
with the locale (`dir="rtl"` / `ltr`), so style with Tailwind logical properties
(`ps-`/`pe-`, `ms-`/`me-`) — `pl-`/`pr-` will mirror wrong in one of them.

UI strings live in `packages/web/src/i18n/`. Arabic is canonical: `Dictionary`
is derived from `ar.ts`, so a key missing from `en.ts` is a type error, and a
test asserts both dictionaries have the same keys and the same `{placeholders}`.

Clinic-supplied text is localized in config, not in source:

| Config | English fallback |
|---|---|
| `clinic.name` / `clinic.nameEn` | required |
| `clinic.address` / `clinic.addressEn` | falls back to Arabic |
| `appointmentTypes[].label` / `.labelEn` | falls back to Arabic |
| `defaultLocale` | defaults to `"ar"` |

`defaultLocale` sets what a device shows before anyone picks; once someone
chooses, that device remembers it (localStorage) and stops following the default.

Server error *messages* stay English — they're for logs. The UI renders the
localized text for the error `code` instead.

## Layout

```
packages/shared/   types + zod schemas — the contract, built first
packages/server/   express 5 on bun, sqlite, ws, printing, whatsapp
packages/web/      react + tailwind SPA, RTL
```

Neither side edits the other's package. A change to a request or response shape
is a change in `shared`.

## Status

**Web** — build items 7, 8, 11 (frontend), 12 (frontend) and 15 are done:
booking screen with day view and open slots, patient page with history,
scan-follow over the websocket, WhatsApp pairing UI, and the print-failure and
"not reminded" banners. Routing is TanStack Router; the day and appointment type
live in the URL and route loaders do the fetching.

**Server** — config load + validation, `/api/health`, `/api/config`, error
envelope, websocket, static SPA serving with deep-link routes. The database,
printing, WhatsApp and reminders are in progress; their health entries report
`disabled` until they exist.

### The web app runs without the server

`packages/web/src/mocks/` intercepts `fetch` and serves the appointment,
patient, slot, print and reminder endpoints from memory, typed against — and
validated with — the Zod schemas in `packages/shared`. So a contract change
breaks the mock rather than silently diverging from it.

It is dev-only: a `define` in `packages/web/build.ts` drops it from a production
build entirely. Delete the `installMockApi()` call in `src/main.tsx` and the
`src/mocks/` folder once the server owns these routes — no component, hook or
URL changes, because every request is already a real relative URL.
