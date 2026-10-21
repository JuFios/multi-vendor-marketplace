import { Outlet } from 'react-router';

import { Header } from './header';

export function RootLayout() {
  return (
    <>
      <Header />
      <main className="mx-auto max-w-6xl px-4 pb-16 pt-6">
        <Outlet />
      </main>
    </>
  );
}
