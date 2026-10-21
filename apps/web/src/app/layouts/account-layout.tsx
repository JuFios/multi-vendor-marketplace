import { NavLink, Outlet } from 'react-router';

import { cn } from '../../components/cn';

const LINKS = [
  { to: '/account', label: 'Profile', end: true },
  { to: '/account/orders', label: 'Orders', end: false },
  { to: '/account/disputes', label: 'Disputes', end: false },
  { to: '/account/notifications', label: 'Notifications', end: false },
] as const;

export function AccountLayout() {
  return (
    <div className="grid gap-6 md:grid-cols-[12rem_1fr]">
      <nav aria-label="Account" className="flex gap-2 md:flex-col">
        {LINKS.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.end}
            className={({ isActive }) =>
              cn(
                'rounded-md px-3 py-2 text-sm',
                isActive ? 'bg-blue-50 font-medium text-brand' : 'hover:bg-slate-100',
              )
            }
          >
            {link.label}
          </NavLink>
        ))}
      </nav>
      <div>
        <Outlet />
      </div>
    </div>
  );
}
