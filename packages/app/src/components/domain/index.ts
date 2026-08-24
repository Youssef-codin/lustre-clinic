// `domain/` knows what a patient, a visit and a balance are. It composes `ui/`
// and adds product meaning (Component Inventory §2). The barrel is the only
// entry point: screens import from `components/domain`, never from a file.
//
// `patientDraft` is the one exception, and is imported by its own path. It is
// rules rather than markup, it is covered by `bun test`, and every component
// below imports `react-native` — which fails outside Metro, so a barrel that
// re-exported it would drag React Native into three suites that have no
// renderer and do not need one.

export type { BottomTabBarProps, TabKey } from './BottomTabBar';
export { BottomTabBar } from './BottomTabBar';
export type { BrandMarkProps } from './BrandMark';
export { BrandMark } from './BrandMark';
export type { MoneyValueProps } from './MoneyValue';
export { formatAmount, formatMoney, MoneyValue } from './MoneyValue';
export type { PatientRowProps, PatientSummary } from './PatientRow';
export { PatientRow } from './PatientRow';
export type { StatusPillProps } from './StatusPill';
export { StatusPill } from './StatusPill';
export type { ToothGroupCardProps, ToothGroupLine } from './ToothGroupCard';
export { ToothGroupCard } from './ToothGroupCard';
