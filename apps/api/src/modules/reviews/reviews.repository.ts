import { Inject, Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';

import { Prisma } from '../../generated/prisma/client';
import type { AppTransactionHost } from '../../prisma/transaction';

import type { NewReview, ReviewRecord } from './review';
import { ReviewAlreadyExistsError } from './reviews.errors';

const UNIQUE_VIOLATION = 'P2002';

@Injectable()
export class ReviewsRepository {
  constructor(@Inject(TransactionHost) private readonly txHost: AppTransactionHost) {}

  /** `ReviewAlreadyExistsError` when a concurrent request got in first (unique per product and author). */
  async create(review: NewReview): Promise<ReviewRecord> {
    try {
      return await this.txHost.tx.review.create({ data: review });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === UNIQUE_VIOLATION
      ) {
        throw new ReviewAlreadyExistsError();
      }
      throw error;
    }
  }

  async exists(productId: string, authorId: string): Promise<boolean> {
    const count = await this.txHost.tx.review.count({ where: { productId, authorId } });
    return count > 0;
  }

  async listOfProduct(
    productId: string,
    page: number,
    limit: number,
  ): Promise<{ items: ReviewRecord[]; total: number }> {
    const [items, total] = await Promise.all([
      this.txHost.tx.review.findMany({
        where: { productId },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.txHost.tx.review.count({ where: { productId } }),
    ]);
    return { items, total };
  }
}
