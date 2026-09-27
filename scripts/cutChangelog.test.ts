import { describe, expect, test } from 'bun:test';
import { cutChangelog } from './cutChangelog';

const BASE = 'https://github.com/o/r';
const changelog = (unreleased: string) => `# Changelog

Intro.

## [Unreleased]
${unreleased}
## [1.6.1] - 2026-09-26

### Fixed

- An old fix.

[Unreleased]: ${BASE}/compare/v1.6.1...HEAD
[1.6.1]: ${BASE}/compare/v1.6.0...v1.6.1
`;

describe('cutChangelog', () => {
    test('opens the release under [Unreleased] and moves the compare links on', () => {
        const cut = cutChangelog(changelog('\n### Changed\n\n- A new thing.\n'), '1.6.2', '2026-09-27');
        expect(cut).toBe(`# Changelog

Intro.

## [Unreleased]

## [1.6.2] - 2026-09-27

### Changed

- A new thing.

## [1.6.1] - 2026-09-26

### Fixed

- An old fix.

[Unreleased]: ${BASE}/compare/v1.6.2...HEAD
[1.6.2]: ${BASE}/compare/v1.6.1...v1.6.2
[1.6.1]: ${BASE}/compare/v1.6.0...v1.6.1
`);
    });

    test('leaves a changelog alone when the release is already cut', () => {
        expect(cutChangelog(changelog('\n'), '1.6.1', '2026-09-27')).toBeNull();
    });

    test('refuses to cut a release with nothing in it', () => {
        expect(() => cutChangelog(changelog('\n### Changed\n\n'), '1.6.2', '2026-09-27')).toThrow(
            'nothing under [Unreleased]',
        );
    });

    test('refuses a changelog without the [Unreleased] compare link', () => {
        const source = changelog('\n- A new thing.\n').replace(/^\[Unreleased\]:.*\n/m, '');
        expect(() => cutChangelog(source, '1.6.2', '2026-09-27')).toThrow('[Unreleased]:');
    });
});
