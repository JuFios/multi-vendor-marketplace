import { useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, NavLink, useNavigate } from 'react-router';

import { Button } from '../../components/button';
import { ConnectionStatusBadge } from '../../components/connection-status-badge';
import { logout } from '../../features/auth/api/auth-api';
import { useSessionUser } from '../../features/auth/use-session';
import { fetchCart } from '../../features/cart/cart-api';
import { fetchUnreadCount } from '../../features/notifications/notifications-api';
import { queryKeys } from '../../lib/query-keys';
import { hasRole } from '../../lib/session';
import { useConnectionStatus } from '../../lib/ws/realtime-context';

export function Header() {
  const user = useSessionUser();
  const status = useConnectionStatus();
  const navigate = useNavigate();
  const [term, setTerm] = useState('');
  const signedIn = user !== null;

  const cart = useQuery({ queryKey: queryKeys.cart, queryFn: fetchCart, enabled: signedIn });
  const unread = useQuery({
    queryKey: queryKeys.unreadCount,
    queryFn: fetchUnreadCount,
    enabled: signedIn,
  });

  const onSearch = (event: FormEvent) => {
    event.preventDefault();
    const q = term.trim();
    void navigate(q === '' ? '/' : `/?q=${encodeURIComponent(q)}`);
  };

  const onLogout = () => {
    void logout().then(() => navigate('/'));
  };

  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
        <Link to="/" className="text-lg font-semibold text-brand">
          Marketplace
        </Link>
        <form onSubmit={onSearch} role="search" className="min-w-48 flex-1">
          <input
            aria-label="Search products"
            placeholder="Search products"
            value={term}
            onChange={(event) => {
              setTerm(event.target.value);
            }}
            className="w-full rounded-md border border-line px-3 py-2 text-sm outline-none ring-brand focus:ring-2"
          />
        </form>
        <nav className="flex items-center gap-3 text-sm">
          <ConnectionStatusBadge status={status} />
          {signedIn ? (
            <>
              {hasRole(user.roles, 'SELLER') ? <NavLink to="/seller">Seller</NavLink> : null}
              {hasRole(user.roles, 'ADMIN') ? <NavLink to="/admin">Admin</NavLink> : null}
              <NavLink to="/account/notifications" aria-label="Notifications">
                🔔
                <span data-testid="unread-count">{unread.data?.count ?? 0}</span>
              </NavLink>
              <NavLink to="/cart">Cart ({cart.data?.itemsCount ?? 0})</NavLink>
              <NavLink to="/account">{user.name}</NavLink>
              <Button variant="secondary" onClick={onLogout}>
                Log out
              </Button>
            </>
          ) : (
            <>
              <NavLink to="/login">Log in</NavLink>
              <NavLink to="/register">Sign up</NavLink>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
