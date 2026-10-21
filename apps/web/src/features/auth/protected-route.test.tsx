import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';

import { sessionStore, type SessionUser } from '../../lib/session';

import { ProtectedRoute } from './protected-route';

function user(roles: SessionUser['roles']): SessionUser {
  return { id: 'u1', email: 'a@b.c', name: 'A', roles, emailVerified: true };
}

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      { path: '/login', element: <p>login page</p> },
      { path: '/forbidden', element: <p>403 page</p> },
      {
        element: <ProtectedRoute role="SELLER" />,
        children: [{ path: '/seller', element: <p>seller area</p> }],
      },
    ],
    { initialEntries: [path] },
  );
  render(<RouterProvider router={router} />);
}

describe('ProtectedRoute', () => {
  afterEach(() => {
    sessionStore.setSession(null);
  });

  it('redirects anonymous visitors to the login page', () => {
    renderAt('/seller');

    expect(screen.getByText('login page')).toBeInTheDocument();
  });

  it('shows the 403 page to a user without the required role', () => {
    sessionStore.setSession({ accessToken: 't', user: user(['CUSTOMER']) });

    renderAt('/seller');

    expect(screen.getByText('403 page')).toBeInTheDocument();
  });

  it('renders the section for a user with the role', () => {
    sessionStore.setSession({ accessToken: 't', user: user(['CUSTOMER', 'SELLER']) });

    renderAt('/seller');

    expect(screen.getByText('seller area')).toBeInTheDocument();
  });
});
