import { SectionLayout } from './section-layout';

const LINKS = [
  { to: '/admin/applications', label: 'Seller applications' },
  { to: '/admin/products', label: 'Product moderation' },
  { to: '/admin/categories', label: 'Categories' },
  { to: '/admin/orders', label: 'Orders' },
] as const;

export function AdminLayout() {
  return <SectionLayout label="Admin" links={LINKS} />;
}
