import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';

import { sessionStore } from '../../lib/session';
import { server } from '../../test/server';

import { LoginPage } from './login-page';

function renderLogin() {
  const router = createMemoryRouter(
    [
      { path: '/login', element: <LoginPage /> },
      { path: '/', element: <p>catalog page</p> },
    ],
    { initialEntries: ['/login'] },
  );
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe('LoginPage', () => {
  afterEach(() => {
    sessionStore.setSession(null);
  });

  it('validates the form before calling the api', async () => {
    server.use(http.get('/api/auth/providers', () => HttpResponse.json({ google: false })));
    renderLogin();

    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByText('Enter your password')).toBeInTheDocument();
  });

  it('shows the api error for wrong credentials', async () => {
    server.use(
      http.get('/api/auth/providers', () => HttpResponse.json({ google: false })),
      http.post('/api/auth/login', () =>
        HttpResponse.json(
          { error: { code: 'INVALID_CREDENTIALS', message: 'bad', correlationId: 'c1' } },
          { status: 401 },
        ),
      ),
    );
    renderLogin();

    await userEvent.type(screen.getByLabelText('Email'), 'a@b.co');
    await userEvent.type(screen.getByLabelText('Password'), 'wrong-pass1');
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password.');
  });

  it('stores the session and leaves the page after a successful login', async () => {
    server.use(
      http.get('/api/auth/providers', () => HttpResponse.json({ google: true })),
      http.post('/api/auth/login', () =>
        HttpResponse.json({
          accessToken: 'jwt',
          tokenType: 'Bearer',
          expiresIn: 900,
          user: { id: 'u1', email: 'a@b.co', name: 'A', roles: ['CUSTOMER'], emailVerified: true },
        }),
      ),
    );
    renderLogin();

    expect(await screen.findByText('Continue with Google')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.co');
    await userEvent.type(screen.getByLabelText('Password'), 'correct-pass1');
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByText('catalog page')).toBeInTheDocument();
    expect(sessionStore.getAccessToken()).toBe('jwt');
  });
});
