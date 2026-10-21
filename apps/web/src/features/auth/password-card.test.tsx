import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { renderAt } from '../../test/render';
import { server } from '../../test/server';

import { PasswordCard } from './password-card';

const me = (hasPassword: boolean) => ({
  id: 'u1',
  email: 'olena@example.com',
  name: 'Olena',
  roles: ['CUSTOMER'],
  emailVerified: true,
  hasPassword,
  createdAt: '2026-01-01T00:00:00Z',
});

function serve(
  hasPassword: boolean,
  answer: () => Response = () => new Response(null, { status: 204 }),
) {
  const bodies: unknown[] = [];
  server.use(
    http.get('/api/users/me', () => HttpResponse.json(me(hasPassword))),
    http.post('/api/users/me/password', async ({ request }) => {
      bodies.push(await request.json());
      return answer();
    }),
  );
  return bodies;
}

describe('PasswordCard', () => {
  it('lets an account without a password set one without the current password', async () => {
    const bodies = serve(false);
    renderAt(<PasswordCard />);

    expect(await screen.findByRole('heading', { name: 'Set a password' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Current password')).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('New password'), 'owner-pass-2026');
    await userEvent.click(screen.getByRole('button', { name: 'Save password' }));

    expect(await screen.findByText('Password saved')).toBeInTheDocument();
    expect(bodies).toEqual([{ newPassword: 'owner-pass-2026' }]);
  });

  it('asks for the current password when one is set and shows a refusal', async () => {
    const bodies = serve(true, () =>
      HttpResponse.json(
        {
          error: {
            code: 'VALIDATION_FAILED',
            message: 'The current password is not correct',
            details: [{ field: 'currentPassword', message: 'The current password is not correct' }],
          },
        },
        { status: 400 },
      ),
    );
    renderAt(<PasswordCard />);

    expect(await screen.findByRole('heading', { name: 'Change password' })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Current password'), 'wrong-pass-1');
    await userEvent.type(screen.getByLabelText('New password'), 'another-pass-1');
    await userEvent.click(screen.getByRole('button', { name: 'Save password' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The current password is not correct',
    );
    expect(bodies).toEqual([{ currentPassword: 'wrong-pass-1', newPassword: 'another-pass-1' }]);
  });
});
