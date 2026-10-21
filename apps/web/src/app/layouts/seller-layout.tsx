import { SectionLayout } from './section-layout';

const LINKS = [
  { to: '/seller', label: 'Dashboard', end: true },
  { to: '/seller/products', label: 'Products' },
  { to: '/seller/auctions', label: 'Auctions' },
  { to: '/seller/orders', label: 'Orders' },
  { to: '/seller/finance', label: 'Finance' },
  { to: '/seller/disputes', label: 'Disputes' },
] as const;

export function SellerLayout() {
  return <SectionLayout label="Seller" links={LINKS} />;
}
