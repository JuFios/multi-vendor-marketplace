import type { ReactNode } from 'react';

export function Table({ headers, children }: { headers: readonly string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-surface">
      <table className="min-w-full text-left text-sm [&_tbody_tr:last-child]:border-b-0 [&_tbody_tr:hover]:bg-slate-50">
        <thead className="border-b border-line bg-slate-50 text-xs uppercase tracking-wide text-muted">
          <tr>
            {headers.map((header, index) => (
              <th key={`${header}-${index}`} className="whitespace-nowrap px-3 py-2.5 font-medium">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
