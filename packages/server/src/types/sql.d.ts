/**
 * Migration SQL is imported as text so it is embedded in the compiled binary.
 * Bun resolves `with { type: 'text' }`; TypeScript needs telling.
 */
declare module '*.sql' {
    const content: string;
    export default content;
}
