import { useCallback, useMemo, useState, type ReactNode } from 'react';

import { ToastContext, type ToastTone } from './toast-context';

interface ToastItem {
  id: string;
  message: string;
  tone: ToastTone;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const push = useCallback((message: string, tone: ToastItem['tone'] = 'info') => {
    const id = crypto.randomUUID();
    setItems((current) => [...current, { id, message, tone }]);
    window.setTimeout(() => {
      setItems((current) => current.filter((item) => item.id !== id));
    }, 4_000);
  }, []);

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-50 flex w-80 flex-col gap-2">
        {items.map((item) => (
          <Toast key={item.id} message={item.message} tone={item.tone} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function Toast({ message, tone }: { message: string; tone: ToastTone }) {
  const colors = {
    info: 'bg-slate-900 text-white',
    error: 'bg-danger text-white',
    ok: 'bg-ok text-white',
  };
  return <div className={`rounded-md px-3 py-2 text-sm shadow ${colors[tone]}`}>{message}</div>;
}
