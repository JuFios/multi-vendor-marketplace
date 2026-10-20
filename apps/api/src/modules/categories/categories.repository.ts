import { Inject, Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';

import { Prisma } from '../../generated/prisma/client';
import type { AppTransactionHost } from '../../prisma/transaction';

import type { Category, CategoryChanges, NewCategory } from './category';

const UNIQUE_VIOLATION = 'P2002';
const FOREIGN_KEY_VIOLATION = 'P2003';
const RECORD_NOT_FOUND = 'P2025';

const isKnownError = (error: unknown, code: string): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;

export const isSlugTaken = (error: unknown): boolean => isKnownError(error, UNIQUE_VIOLATION);

/** A Restrict foreign key refused the delete: products or subcategories still point here. */
export const isStillReferenced = (error: unknown): boolean =>
  isKnownError(error, FOREIGN_KEY_VIOLATION);

const SELECT = { id: true, name: true, slug: true, parentId: true } as const;

/** Owns `categories`; whether products use a category is decided by the foreign key. */
@Injectable()
export class CategoriesRepository {
  constructor(@Inject(TransactionHost) private readonly txHost: AppTransactionHost) {}

  list(): Promise<Category[]> {
    return this.txHost.tx.category.findMany({
      select: SELECT,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
  }

  findById(id: string): Promise<Category | null> {
    return this.txHost.tx.category.findUnique({ where: { id }, select: SELECT });
  }

  create(category: NewCategory): Promise<Category> {
    return this.txHost.tx.category.create({ data: category, select: SELECT });
  }

  /** Returns null when the category does not exist. */
  async update(id: string, changes: CategoryChanges): Promise<Category | null> {
    try {
      return await this.txHost.tx.category.update({
        where: { id },
        data: changes,
        select: SELECT,
      });
    } catch (error) {
      if (isKnownError(error, RECORD_NOT_FOUND)) {
        return null;
      }
      throw error;
    }
  }

  /** Returns whether a row was deleted. */
  async delete(id: string): Promise<boolean> {
    const { count } = await this.txHost.tx.category.deleteMany({ where: { id } });
    return count > 0;
  }
}
