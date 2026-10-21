import { Link, Outlet } from 'react-router';

import { Card } from '../../components/card';
import { useSessionUser } from '../../features/auth/use-session';
import { hasRole } from '../../lib/session';

export function AccountHomePage() {
  const user = useSessionUser();
  return (
    <Card className="max-w-lg">
      <h1 className="mb-2 text-xl font-semibold">My account</h1>
      <p className="text-sm">{user?.name}</p>
      <p className="text-sm text-muted">{user?.email}</p>
      {hasRole(user?.roles, 'SELLER') ? (
        <Link to="/seller" className="mt-3 inline-block text-sm text-brand">
          Open seller area
        </Link>
      ) : (
        <Link to="/account/seller-application" className="mt-3 inline-block text-sm text-brand">
          Become a seller
        </Link>
      )}
    </Card>
  );
}

export function SectionLayout() {
  return <Outlet />;
}
