import { Inject, Injectable, Logger } from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { Counter } from '@prometheus-io/client';
import { InjectMetric } from '@willsoto/nestjs-prometheus';

import { AppError } from '../../common/exceptions/app-error';
import { ordersConfig } from '../../config/orders.config';
import { IdempotencyService } from '../../idempotency/idempotency.service';
import { CHECKOUT_FAILURES_TOTAL, ORDERS_CREATED_TOTAL } from '../../metrics/metrics.constants';
import { EVENT_TYPE } from '../../outbox/events/event-types';
import { OutboxService } from '../../outbox/outbox.service';
import type { AppTransactionHost } from '../../prisma/transaction';
import { AuctionsService } from '../bidding/auctions.service';
import { CartService } from '../cart/cart.service';
import { LedgerService } from '../payments-ledger/ledger.service';
import { InventoryService } from '../products/inventory.service';
import { SellersService } from '../sellers/sellers.service';

import { findCheckoutProblems } from './checkout-problems';
import { OrderResponseDto } from './dto/order-response.dto';
import { CartEmptyError, CartItemsUnavailableError } from './orders.errors';
import { type CheckoutItem } from './orders.repository';
import { OrdersRepository } from './orders.repository';
import { splitCartBySeller } from './split-cart';

@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);

  constructor(
    @Inject(TransactionHost) private readonly txHost: AppTransactionHost,
    @Inject(ordersConfig.KEY) private readonly settings: ConfigType<typeof ordersConfig>,
    @InjectMetric(ORDERS_CREATED_TOTAL) private readonly created: Counter,
    @InjectMetric(CHECKOUT_FAILURES_TOTAL) private readonly failures: Counter<'reason'>,
    private readonly orders: OrdersRepository,
    private readonly cart: CartService,
    private readonly inventory: InventoryService,
    private readonly auctions: AuctionsService,
    private readonly ledger: LedgerService,
    private readonly sellers: SellersService,
    private readonly outbox: OutboxService,
    private readonly idempotency: IdempotencyService,
  ) {}

  /**
   * Turns the user's cart into one order with a seller order per seller. Stock, order, books,
   * cart and events commit together or not at all; any failure leaves everything untouched.
   */
  async checkout(userId: string): Promise<OrderResponseDto> {
    try {
      const { response, productIds } = await this.txHost.withTransaction(() =>
        this.placeOrder(userId),
      );
      await this.inventory.invalidateDetails(productIds);
      this.created.inc();
      this.logger.log({
        msg: 'order.created',
        orderId: response.id,
        sellerOrderIds: response.sellerOrders.map((sellerOrder) => sellerOrder.id),
        itemsCount: response.sellerOrders.reduce((sum, so) => sum + so.items.length, 0),
        totalCents: response.totalCents,
      });
      return response;
    } catch (error) {
      this.failures.inc({ reason: error instanceof AppError ? error.code : 'UNEXPECTED' });
      throw error;
    }
  }

  private async placeOrder(
    userId: string,
  ): Promise<{ response: OrderResponseDto; productIds: string[] }> {
    const locked = await this.cart.lockActiveLines(userId);
    if (locked === null || locked.lines.length === 0) {
      throw new CartEmptyError();
    }
    const problems = findCheckoutProblems(locked.lines);
    if (problems.length > 0) {
      throw new CartItemsUnavailableError(problems);
    }

    // The price and title come back from the same UPDATE that takes the stock, so the order
    // is priced with exactly what was sold.
    const fixedPrice = locked.lines.filter((line) => line.type === 'FIXED_PRICE');
    const lots = locked.lines.filter((line) => line.type === 'AUCTION');
    const reserved = await this.inventory.reserve(
      fixedPrice.map((line) => ({ productId: line.productId, quantity: line.quantity })),
    );
    // A won lot is sold at the winning bid and has no stock to take: the conditional update of
    // the auction is what reserves it, and it fails the whole checkout if the window ran out.
    const settled = await this.auctions.settleWonLots(
      userId,
      lots.map((line) => line.productId),
    );
    const titles = new Map(lots.map((line) => [line.productId, line.title]));
    const items: CheckoutItem[] = [
      ...reserved.map((item) => ({
        sellerId: item.sellerId,
        productId: item.productId,
        title: item.title,
        unitPriceCents: item.unitPriceCents,
        quantity: item.quantity,
      })),
      ...settled.map((lot) => ({
        sellerId: lot.sellerId,
        productId: lot.productId,
        title: titles.get(lot.productId) ?? '',
        unitPriceCents: lot.priceCents,
        quantity: 1,
        auctionId: lot.auctionId,
      })),
    ].sort((a, b) => (a.productId < b.productId ? -1 : a.productId > b.productId ? 1 : 0));
    const groups = splitCartBySeller(items, this.settings.commissionBps);
    const order = await this.orders.create(userId, groups, this.settings.commissionBps);

    for (const sellerOrder of order.sellerOrders) {
      await this.ledger.recordSale({
        sellerOrderId: sellerOrder.id,
        sellerId: sellerOrder.sellerId,
        subtotalCents: sellerOrder.subtotalCents,
        commissionCents: sellerOrder.commissionCents,
      });
    }
    await this.cart.convert(locked.cartId, order.id);
    await this.outbox.add(
      order.sellerOrders.map((sellerOrder) => ({
        type: EVENT_TYPE.SELLER_ORDER_CREATED,
        aggregateType: 'SellerOrder',
        aggregateId: sellerOrder.id,
        payload: {
          sellerOrderId: sellerOrder.id,
          orderId: order.id,
          sellerId: sellerOrder.sellerId,
          customerId: userId,
          amountCents: sellerOrder.subtotalCents,
        },
      })),
    );

    if (settled.length > 0) {
      await this.outbox.add(
        settled.map((lot) => ({
          type: EVENT_TYPE.AUCTION_ORDERED,
          aggregateType: 'Auction',
          aggregateId: lot.auctionId,
          payload: { auctionId: lot.auctionId, productId: lot.productId, orderId: order.id },
        })),
      );
    }

    const storeNames = await this.sellers.findStoreNames(groups.map((group) => group.sellerId));
    const response = OrderResponseDto.from(order, storeNames);
    await this.idempotency.complete(response);
    return { response, productIds: items.map((item) => item.productId) };
  }
}
