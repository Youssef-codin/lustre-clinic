// Crash reports to GlitchTip (SPEC §17). `api/` and `navigation/` import
// `./trail` directly instead of this barrel, because this one loads the SDK and
// `bun test` reaches both of them.
export type { ProblemReport } from './reporting';
export { CRASH_REPORTS_ON, renderErrorReporter, reportProblem, startCrashReports } from './reporting';
export { noteScreen } from './trail';
export { useCrashReportRole } from './useCrashReportRole';
