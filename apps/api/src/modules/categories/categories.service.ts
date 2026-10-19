import { Inject, Injectable, Logger } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';

import { OutboxService } from '../../outbox';
import { EVENT_TYPE } from '../../outbox/events';
import type { AppTransactionHost } from '../../prisma';

import {
  CategoryInUseError,
  CategoryNotFoundError,
  CategoryParentInvalidError,
  CategorySlugTakenError,
} from './categories.errors';
import { CategoriesRepository, isSlugTaken, isStillReferenced } from './categories.repository';
import {
  CATEGORY_MAX_DEPTH,
  type Category,
  type CategoryChanges,
  createsCycle,
  type NewCategory,
} from './category';

@Injectable()
export class CategoriesService {
  private readonly logger = new Logger(CategoriesService.name);

  constructor(
    @Inject(TransactionHost) private readonly txHost: AppTransactionHost,
    private readonly categories: CategoriesRepository,
    private readonly outbox: OutboxService,
  ) {}

  list(): Promise<Category[]> {
    return this.categories.list();
  }

  async create(adminId: string, category: NewCategory): Promise<Category> {
    if (category.parentId !== null) {
      await this.requireParent(category.parentId);
    }
    try {
      const created = await this.categories.create(category);
      this.logger.log({ msg: 'category.created', adminId, categoryId: created.id });
      return created;
    } catch (error) {
      throw isSlugTaken(error) ? new CategorySlugTakenError() : error;
    }
  }

  /** The change and the `category.updated` event commit together. */
  async update(adminId: string, id: string, changes: CategoryChanges): Promise<Category> {
    if (changes.parentId != null) {
      await this.requireParentFor(id, changes.parentId);
    }
    try {
      const updated = await this.txHost.withTransaction(async () => {
        const row = await this.categories.update(id, changes);
        if (row === null) {
          throw new CategoryNotFoundError();
        }
        await this.outbox.add([
          {
            type: EVENT_TYPE.CATEGORY_UPDATED,
            aggregateType: 'Category',
            aggregateId: id,
            payload: { categoryId: id },
            actorId: adminId,
          },
        ]);
        return row;
      });
      this.logger.log({ msg: 'category.updated', adminId, categoryId: id });
      return updated;
    } catch (error) {
      throw isSlugTaken(error) ? new CategorySlugTakenError() : error;
    }
  }

  async delete(adminId: string, id: string): Promise<void> {
    try {
      if (!(await this.categories.delete(id))) {
        throw new CategoryNotFoundError();
      }
    } catch (error) {
      throw isStillReferenced(error) ? new CategoryInUseError() : error;
    }
    this.logger.log({ msg: 'category.deleted', adminId, categoryId: id });
  }

  private async requireParent(parentId: string): Promise<Category> {
    const parent = await this.categories.findById(parentId);
    if (!parent) {
      throw new CategoryParentInvalidError('The parent category does not exist');
    }
    return parent;
  }

  /** The new parent must exist and must not be the category itself or one of its descendants. */
  private async requireParentFor(id: string, parentId: string): Promise<void> {
    await this.requireParent(parentId);
    const parents = new Map<string, string | null>();
    let current: string | null = parentId;
    for (let depth = 0; current !== null && depth <= CATEGORY_MAX_DEPTH * 4; depth += 1) {
      const row = await this.categories.findById(current);
      if (!row) {
        break;
      }
      parents.set(row.id, row.parentId);
      current = row.parentId;
    }
    if (createsCycle(id, parentId, (key) => parents.get(key))) {
      throw new CategoryParentInvalidError('A category cannot be placed below itself');
    }
  }
}
