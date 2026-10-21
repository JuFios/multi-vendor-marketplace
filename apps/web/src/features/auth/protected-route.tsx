import { Navigate, Outlet, useLocation } from 'react-router';

import { hasRole, type UserRole } from '../../lib/session';

import { useSessionUser } from './use-session';

export function ProtectedRoute({ role }: { role?: UserRole }) {
  const user = useSessionUser();
  const location = useLocation();

  if (user === null) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  if (role !== undefined && !hasRole(user.roles, role)) {
    return <Navigate to="/forbidden" replace />;
  }
  return <Outlet />;
}
