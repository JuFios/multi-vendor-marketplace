import 'reflect-metadata';

import { createValidationPipe } from '../pipes/validation.pipe';

import { MAX_PAGE_SIZE, PaginationQueryDto } from './pagination-query.dto';

const transform = (query: Record<string, string>) =>
  createValidationPipe().transform(query, { type: 'query', metatype: PaginationQueryDto });

describe('PaginationQueryDto', () => {
  it('defaults to the first page of 20', async () => {
    expect(await transform({})).toMatchObject({ page: 1, limit: 20 });
  });

  it('converts query strings to numbers', async () => {
    expect(await transform({ page: '3', limit: '50' })).toMatchObject({ page: 3, limit: 50 });
  });

  it.each([
    ['page below 1', { page: '0' }],
    ['non-numeric page', { page: 'abc' }],
    ['fractional page', { page: '1.5' }],
    ['limit below 1', { limit: '0' }],
    ['limit over the maximum', { limit: String(MAX_PAGE_SIZE + 1) }],
    ['empty limit', { limit: '' }],
  ])('rejects %s', async (_name, query) => {
    await expect(transform(query)).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });
});
