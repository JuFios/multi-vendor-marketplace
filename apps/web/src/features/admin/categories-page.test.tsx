import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { renderAt } from '../../test/render';
import { server } from '../../test/server';

import { CategoriesPage } from './categories-page';
import { slugify } from './category-schema';
import { flattenTree } from './category-tree';

const categories = [
  { id: 'c2', name: 'Keyboards', slug: 'keyboards', parentId: 'c1' },
  { id: 'c1', name: 'Peripherals', slug: 'peripherals', parentId: null },
];

describe('categories', () => {
  it('orders a flat list into a tree with depths', () => {
    const rows = flattenTree(categories);

    expect(rows.map((row) => [row.category.name, row.depth])).toEqual([
      ['Peripherals', 0],
      ['Keyboards', 1],
    ]);
  });

  it('builds a slug from a name', () => {
    expect(slugify('Home & Garden!')).toBe('home-garden');
    expect(slugify('Ёлки')).toBe('');
  });

  it('creates a category with a generated slug', async () => {
    let body: unknown;
    server.use(
      http.get('/api/categories', () => HttpResponse.json(categories)),
      http.post('/api/admin/categories', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(
          { id: 'c3', name: 'Audio', slug: 'audio', parentId: null },
          { status: 201 },
        );
      }),
    );
    renderAt(<CategoriesPage />);

    await userEvent.click(await screen.findByRole('button', { name: 'New category' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Audio');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create category' }));

    expect(await screen.findByText('Category created')).toBeInTheDocument();
    expect(body).toEqual({ name: 'Audio', slug: 'audio' });
  });

  it('explains why a category in use cannot be deleted', async () => {
    server.use(
      http.get('/api/categories', () => HttpResponse.json(categories)),
      http.delete('/api/admin/categories/c1', () =>
        HttpResponse.json(
          { error: { code: 'CATEGORY_IN_USE', message: 'in use' } },
          { status: 409 },
        ),
      ),
    );
    renderAt(<CategoriesPage />);

    await userEvent.click(await screen.findByRole('button', { name: 'Delete Peripherals' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete category' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'still has products or subcategories',
    );
  });
});
