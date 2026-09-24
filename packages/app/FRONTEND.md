# Frontend (packages/app)

Expo / React Native app.

Read before building anything:
- Designs: https://app.notion.com/p/3b8541c6b441819f9a81f70c0432d313. They are runnable HTML mockups in a local Open Design folder, not Figma. Read the design before building a screen or a shared component.
- Running on a real phone or the emulator: https://app.notion.com/p/3b7541c6b44181508d22e598bab63842. `bun app` runs it on a phone over USB. The page also covers the emulator setup and the ABI trap.

Rules:
- `useEffect` is banned and `bun lint` enforces it. Use it only to sync with something outside React: a timer, an animation, a native listener, a subscription. Work out derived state during render. A reaction to a tap goes in the handler. If you truly need it, suppress it on the import: `// biome-ignore lint/style/noRestrictedImports: <the outside thing>`.
- Localize errors from `ERROR_CODE`. Never parse the server's message text.
- Styling uses only the tokens in `src/theme/tokens.ts`, through `StyleSheet.create`.
- Read the README in a folder before editing it: `src/api`, `src/theme`, `src/notifications`, `src/components/ui`, `src/components/domain`, `src/screens/*`.
