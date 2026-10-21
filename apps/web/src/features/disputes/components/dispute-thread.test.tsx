import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { DisputeDetails } from '../disputes-api';

import { DisputeThread } from './dispute-thread';

const dispute: DisputeDetails = {
  id: 'd1',
  orderId: 'o1',
  sellerOrderId: 'so1',
  customerId: 'u1',
  sellerId: 's1',
  reason: 'Box was empty',
  status: 'OPEN',
  resolutionNote: null,
  resolvedAt: null,
  createdAt: '2026-01-01T00:00:00Z',
  messages: [
    {
      id: 'm1',
      authorId: 'u1',
      authorRole: 'CUSTOMER',
      text: 'Please help',
      createdAt: '2026-01-01T00:00:00Z',
    },
    {
      id: 'm2',
      authorId: 'u2',
      authorRole: 'SELLER',
      text: 'Sending a new one',
      createdAt: '2026-01-01T01:00:00Z',
    },
  ],
};

describe('DisputeThread', () => {
  it('labels messages by author and sends a reply', async () => {
    const onSend = vi.fn();
    render(<DisputeThread dispute={dispute} currentUserId="u2" sending={false} onSend={onSend} />);

    expect(screen.getByText(/^You ·/)).toBeInTheDocument();
    expect(screen.getByText(/^Buyer ·/)).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Message'), 'Tracking number 123');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(onSend).toHaveBeenCalledWith('Tracking number 123');
  });

  it('does not send an empty message', async () => {
    const onSend = vi.fn();
    render(<DisputeThread dispute={dispute} currentUserId="u2" sending={false} onSend={onSend} />);

    await userEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByText('Write a message')).toBeInTheDocument();
    expect(onSend).not.toHaveBeenCalled();
  });

  it('closes the conversation once the dispute is resolved', () => {
    render(
      <DisputeThread
        dispute={{ ...dispute, status: 'RESOLVED_SELLER_FAVOR', resolutionNote: 'No fault' }}
        currentUserId="u1"
        sending={false}
        onSend={vi.fn()}
      />,
    );

    expect(screen.getByText('This dispute is closed.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull();
    expect(screen.getByText('Resolution: No fault')).toBeInTheDocument();
  });
});
