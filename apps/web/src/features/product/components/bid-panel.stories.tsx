import type { Meta, StoryObj } from '@storybook/react-vite';
import { MemoryRouter } from 'react-router';

import { BidPanelView, type BidPanelViewProps } from './bid-panel-view';

const now = new Date();
const auction: BidPanelViewProps['auction'] = {
  id: 'a1',
  productId: 'p1',
  sellerId: 's1',
  status: 'ACTIVE',
  round: 1,
  startPriceCents: 10000,
  bidStepCents: 500,
  currentPriceCents: 12000,
  minNextBidCents: 12500,
  bidCount: 3,
  leader: 'Bidder #ab12',
  endsAt: new Date(now.getTime() + 5_400_000).toISOString(),
  winnerDeadlineAt: null,
  version: 4,
  serverTime: now.toISOString(),
};
const bids: BidPanelViewProps['bids'] = [
  {
    id: 'b3',
    round: 1,
    amountCents: 12000,
    bidder: 'Bidder #ab12',
    isOwn: false,
    createdAt: now.toISOString(),
  },
  {
    id: 'b2',
    round: 1,
    amountCents: 11000,
    bidder: 'Bidder #77f0',
    isOwn: true,
    createdAt: now.toISOString(),
  },
];

const meta = {
  title: 'Auction/BidPanel',
  component: BidPanelView,
  decorators: [
    (Story) => (
      <MemoryRouter>
        <div className="max-w-md">
          <Story />
        </div>
      </MemoryRouter>
    ),
  ],
  args: {
    auction,
    bids,
    connection: 'connected',
    signedIn: true,
    isWinner: false,
    pending: false,
    error: null,
    onBid: () => undefined,
  },
} satisfies Meta<typeof BidPanelView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Active: Story = {};
export const ActiveSignedOut: Story = { args: { signedIn: false } };
export const NoBidsYet: Story = {
  args: {
    auction: { ...auction, currentPriceCents: null, minNextBidCents: 10000, bidCount: 0 },
    bids: [],
  },
};
export const Submitting: Story = { args: { pending: true } };
export const BidTooLow: Story = {
  args: { error: 'Your bid is too low. The minimum is now $140.00.' },
};
export const Offline: Story = { args: { connection: 'offline' } };
export const Reconnecting: Story = { args: { connection: 'connecting' } };
export const WonByYou: Story = {
  args: {
    auction: {
      ...auction,
      status: 'SOLD_TO_WINNER',
      winnerDeadlineAt: new Date(now.getTime() + 1_800_000).toISOString(),
    },
    isWinner: true,
  },
};
export const EndedForOthers: Story = {
  args: {
    auction: {
      ...auction,
      status: 'SOLD_TO_WINNER',
      winnerDeadlineAt: new Date(now.getTime() + 1_800_000).toISOString(),
    },
  },
};
export const Sold: Story = { args: { auction: { ...auction, status: 'ORDERED' } } };
export const NotSold: Story = {
  args: { auction: { ...auction, status: 'NOT_SOLD', bidCount: 0 }, bids: [] },
};
