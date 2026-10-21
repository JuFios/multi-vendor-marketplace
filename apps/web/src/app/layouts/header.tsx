import { useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, NavLink, useNavigate, type NavLinkRenderProps } from 'react-router';

import { Button } from '../../components/button';
import { cn } from '../../components/cn';
import { ConnectionStatusBadge } from '../../components/connection-status-badge';
import { logout } from '../../features/auth/api/auth-api';
import { useSessionUser } from '../../features/auth/use-session';
import { fetchCart } from '../../features/cart/cart-api';
import { fetchUnreadCount } from '../../features/notifications/notifications-api';
import { queryKeys } from '../../lib/query-keys';
import { hasRole } from '../../lib/session';
import { useConnectionStatus } from '../../lib/ws/realtime-context';

const navLink = ({ isActive }: NavLinkRenderProps) =>
  cn('rounded-md px-2 py-1.5 hover:bg-slate-100', isActive ? 'font-medium text-brand' : 'text-ink');

function BellIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

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
    <header className="sticky top-0 z-20 border-b border-line bg-surface">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <Link to="/" className="text-lg font-semibold text-brand">
          Marketplace
        </Link>
        <form
          onSubmit={onSearch}
          role="search"
          className="order-last w-full md:order-none md:w-auto md:flex-1"
        >
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
        <nav className="ml-auto flex flex-wrap items-center gap-1 text-sm">
          <span className="mr-1">
            <ConnectionStatusBadge status={status} />
          </span>
          {signedIn ? (
            <>
              {hasRole(user.roles, 'SELLER') ? (
                <NavLink to="/seller" className={navLink}>
                  Seller
                </NavLink>
              ) : null}
              {hasRole(user.roles, 'ADMIN') ? (
                <NavLink to="/admin" className={navLink}>
                  Admin
                </NavLink>
              ) : null}
              <NavLink
                to="/account/notifications"
                aria-label="Notifications"
                className={(props) => cn(navLink(props), 'relative')}
              >
                <BellIcon />
                <span
                  data-testid="unread-count"
                  className={cn(
                    'absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-danger px-1 text-center text-[10px] font-semibold leading-4 text-white',
                    (unread.data?.count ?? 0) === 0 && 'hidden',
                  )}
                >
                  {unread.data?.count ?? 0}
                </span>
              </NavLink>
              <NavLink to="/cart" className={navLink}>
                Cart ({cart.data?.itemsCount ?? 0})
              </NavLink>
              <NavLink to="/account" className={(props) => cn(navLink(props), 'max-w-32 truncate')}>
                {user.name}
              </NavLink>
              <Button variant="secondary" className="ml-2" onClick={onLogout}>
                Log out
              </Button>
            </>
          ) : (
            <>
              <NavLink to="/login" className={navLink}>
                Log in
              </NavLink>
              <NavLink to="/register" className={navLink}>
                Sign up
              </NavLink>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
