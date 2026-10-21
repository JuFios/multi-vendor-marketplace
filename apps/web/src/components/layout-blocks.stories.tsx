import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

import { Button } from './button';
import { Card } from './card';
import { Modal } from './modal';
import { Pagination } from './pagination';
import { Table } from './table';

const meta = { title: 'UI/Layout blocks' } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const CardBlock: Story = { render: () => <Card>Card content</Card> };
export const TableBlock: Story = {
  render: () => (
    <Table headers={['Product', 'Qty', 'Price']}>
      <tr className="border-b border-line">
        <td className="px-3 py-2">Keyboard</td>
        <td className="px-3 py-2">2</td>
        <td className="px-3 py-2">$120.00</td>
      </tr>
    </Table>
  ),
};
function PaginationDemo() {
  const [page, setPage] = useState(2);
  return <Pagination page={page} limit={20} total={95} onPageChange={setPage} />;
}

function ModalDemo() {
  const [open, setOpen] = useState(true);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Open</Button>
      <Modal open={open} title="Archive product" onClose={() => setOpen(false)}>
        <p className="text-sm">The product will be hidden from the catalog.</p>
      </Modal>
    </>
  );
}

export const PaginationBlock: Story = { render: () => <PaginationDemo /> };
export const ModalBlock: Story = { render: () => <ModalDemo /> };
