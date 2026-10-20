import { Inject, Injectable, Logger } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';

import { EVENT_TYPE } from '../../outbox/events/event-types';
import { OutboxService } from '../../outbox/outbox.service';
import type { AppTransactionHost } from '../../prisma/transaction';
import { OrdersService } from '../orders/orders.service';
import { ProductsService } from '../products/products.service';
import { UsersService } from '../users/users.service';

import { CreateReviewDto } from './dto/create-review.dto';
import { ReviewEligibilityDto, ReviewPageDto, ReviewResponseDto } from './dto/review-response.dto';
import { decideEligibility } from './review';
import { ReviewAlreadyExistsError, ReviewNotAllowedError } from './reviews.errors';
import { ReviewsRepository } from './reviews.repository';

const UNKNOWN_AUTHOR = 'Customer';

@Injectable()
export class ReviewsService {
  private readonly logger = new Logger(ReviewsService.name);

  constructor(
    @Inject(TransactionHost) private readonly txHost: AppTransactionHost,
    private readonly reviews: ReviewsRepository,
    private readonly orders: OrdersService,
    private readonly products: ProductsService,
    private readonly users: UsersService,
    private readonly outbox: OutboxService,
  ) {}

  async list(productId: string, page: number, limit: number): Promise<ReviewPageDto> {
    await this.products.assertPublished(productId);
    const { items, total } = await this.reviews.listOfProduct(productId, page, limit);
    const names = await this.users.findNames([...new Set(items.map((item) => item.authorId))]);
    return {
      items: items.map((item) =>
        ReviewResponseDto.from(item, names.get(item.authorId) ?? UNKNOWN_AUTHOR),
      ),
      total,
      page,
      limit,
    };
  }

  async eligibility(customerId: string, productId: string): Promise<ReviewEligibilityDto> {
    await this.products.assertPublished(productId);
    return ReviewEligibilityDto.from(
      decideEligibility({
        completedItemId: await this.orders.findCompletedItemId(customerId, productId),
        alreadyReviewed: await this.reviews.exists(productId, customerId),
      }),
    );
  }

  /**
   * The review, the product's new rating and `product.rating_changed` commit together, so the
   * average always matches the reviews that exist.
   */
  async create(
    customerId: string,
    productId: string,
    input: CreateReviewDto,
  ): Promise<ReviewResponseDto> {
    await this.products.assertPublished(productId);
    const created = await this.txHost.withTransaction(async () => {
      const sellerOrderItemId = await this.orders.findCompletedItemId(customerId, productId);
      if (sellerOrderItemId === null) {
        throw new ReviewNotAllowedError();
      }
      if (await this.reviews.exists(productId, customerId)) {
        throw new ReviewAlreadyExistsError();
      }
      const review = await this.reviews.create({
        productId,
        authorId: customerId,
        sellerOrderItemId,
        rating: input.rating,
        text: input.text,
      });
      const totals = await this.products.addRating(productId, input.rating);
      await this.outbox.add([
        {
          type: EVENT_TYPE.PRODUCT_RATING_CHANGED,
          aggregateType: 'Product',
          aggregateId: productId,
          payload: { productId, ...totals },
          actorId: customerId,
        },
      ]);
      return review;
    });
    this.logger.log({
      msg: 'review.created',
      reviewId: created.id,
      productId,
      rating: created.rating,
    });
    const names = await this.users.findNames([customerId]);
    return ReviewResponseDto.from(created, names.get(customerId) ?? UNKNOWN_AUTHOR);
  }
}
