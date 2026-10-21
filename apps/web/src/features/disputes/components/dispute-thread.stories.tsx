import type { Meta, StoryObj } from '@storybook/react-vite';

import { DisputeThread } from './dispute-thread';

const dispute = {
  id: 'd1',
  orderId: 'o1',
  sellerOrderId: 'so1',
  customerId: 'u1',
  sellerId: 's1',
  reason: 'The box arrived empty.',
  status: 'OPEN' as const,
  resolutionNote: null,
  resolvedAt: null,
  createdAt: '2026-01-01T00:00:00Z',
  messages: [
    {
      id: 'm1',
      authorId: 'u1',
      authorRole: 'CUSTOMER' as const,
      text: 'Nothing inside, please help.',
      createdAt: '2026-01-01T09:00:00Z',
    },
    {
      id: 'm2',
      authorId: 'u2',
      authorRole: 'SELLER' as const,
      text: 'Sorry, sending a replacement.',
      createdAt: '2026-01-01T10:00:00Z',
    },
    {
      id: 'm3',
      authorId: 'u3',
      authorRole: 'ADMIN' as const,
      text: 'Looking into it.',
      createdAt: '2026-01-01T11:00:00Z',
    },
  ],
};

const meta = {
  title: 'Disputes/DisputeThread',
  component: DisputeThread,
  args: { dispute, currentUserId: 'u1', sending: false, onSend: () => undefined },
} satisfies Meta<typeof DisputeThread>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Conversation: Story = {};
export const NoMessages: Story = { args: { dispute: { ...dispute, messages: [] } } };
export const Sending: Story = { args: { sending: true } };
export const SendFailed: Story = { args: { error: 'Could not send the message.' } };
export const Resolved: Story = {
  args: {
    dispute: {
      ...dispute,
      status: 'RESOLVED_BUYER_FAVOR',
      resolutionNote: 'Items refunded in full.',
    },
  },
};
