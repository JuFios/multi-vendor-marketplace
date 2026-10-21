import type { Meta, StoryObj } from '@storybook/react-vite';

import { ConnectionStatusBadge } from './connection-status-badge';
import { Countdown } from './countdown';
import { Money } from './money';
import { OrderStatusBadge, StatusBadge } from './status-badge';

const meta = { title: 'UI/Status and values' } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const Badges: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      {['NEW', 'PROCESSING', 'SHIPPED', 'COMPLETED', 'CANCELLED', 'PENDING', 'REJECTED'].map(
        (status) => (
          <StatusBadge key={status} status={status} />
        ),
      )}
      <OrderStatusBadge status="PROCESSING" hasCancelledParts />
    </div>
  ),
};
export const Connection: Story = {
  render: () => (
    <div className="flex gap-2">
      <ConnectionStatusBadge status="connected" />
      <ConnectionStatusBadge status="connecting" />
      <ConnectionStatusBadge status="offline" />
    </div>
  ),
};
export const Price: Story = { render: () => <Money cents={1234567} /> };
export const AuctionCountdown: Story = {
  render: () => {
    const now = new Date();
    return (
      <Countdown
        endsAt={new Date(now.getTime() + 3_725_000).toISOString()}
        serverTime={now.toISOString()}
      />
    );
  },
};
