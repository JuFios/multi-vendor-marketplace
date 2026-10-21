import { NavLink, Outlet } from 'react-router';

import { cn } from '../../components/cn';

export interface SectionLink {
  to: string;
  label: string;
  end?: boolean;
}

/** Side navigation shared by the account, seller and admin areas. */
export function SectionLayout({ label, links }: { label: string; links: readonly SectionLink[] }) {
  return (
    <div className="grid gap-6 md:grid-cols-[12rem_1fr]">
      <nav aria-label={label} className="flex flex-wrap gap-2 md:flex-col">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.end ?? false}
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
      <div className="min-w-0">
        <Outlet />
      </div>
    </div>
  );
}
