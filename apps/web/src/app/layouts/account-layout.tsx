import { SectionLayout } from './section-layout';

const LINKS = [
  { to: '/account', label: 'Profile', end: true },
  { to: '/account/orders', label: 'Orders' },
  { to: '/account/disputes', label: 'Disputes' },
  { to: '/account/notifications', label: 'Notifications' },
] as const;

export function AccountLayout() {
  return <SectionLayout label="Account" links={LINKS} />;
}
