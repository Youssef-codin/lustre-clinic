// `.svg` imports are components, not URIs — see the transformer wiring in
// metro.config.js. Without this TypeScript resolves them to `any` at best.
declare module '*.svg' {
    import type { SvgProps } from 'react-native-svg';

    const content: React.FC<SvgProps>;
    export default content;
}
