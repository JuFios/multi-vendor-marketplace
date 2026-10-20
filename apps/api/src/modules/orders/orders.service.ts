import { Injectable } from '@nestjs/common';

import { SellersService } from '../sellers/sellers.service';

import {
  OrderPageDto,
  OrderResponseDto,
  SellerOrderDto,
  SellerOrderPageDto,
} from './dto/order-response.dto';
import type { OrderRecord } from './order';
import type { OrderStatusValue, SellerOrderStatusValue } from './order-status';
import { OrderNotFoundError, SellerOrderNotFoundError } from './orders.errors';
import { OrdersRepository } from './orders.repository';

/** Reads. Ownership lives in the query: an order that is not yours is simply not found. */
@Injectable()
export class OrdersService {
  constructor(
    private readonly orders: OrdersRepository,
    private readonly sellers: SellersService,
  ) {}

  async listOfCustomer(customerId: string, page: number, limit: number): Promise<OrderPageDto> {
    return this.page(await this.orders.listOfCustomer(customerId, page, limit), page, limit);
  }

  async getOfCustomer(customerId: string, id: string): Promise<OrderResponseDto> {
    const order = await this.orders.findOfCustomer(id, customerId);
    if (order === null) {
      throw new OrderNotFoundError();
    }
    return this.toOrderResponse(order);
  }

  async listAll(
    status: OrderStatusValue | undefined,
    page: number,
    limit: number,
  ): Promise<OrderPageDto> {
    return this.page(await this.orders.listAll(status, page, limit), page, limit);
  }

  async getAny(id: string): Promise<OrderResponseDto> {
    const order = await this.orders.findById(id);
    if (order === null) {
      throw new OrderNotFoundError();
    }
    return this.toOrderResponse(order);
  }

  async listOfSeller(
    sellerId: string,
    status: SellerOrderStatusValue | undefined,
    page: number,
    limit: number,
  ): Promise<SellerOrderPageDto> {
    const { items, total } = await this.orders.listSellerOrdersOf(sellerId, status, page, limit);
    const names = await this.sellers.findStoreNames([sellerId]);
    return { items: items.map((item) => SellerOrderDto.from(item, names)), total, page, limit };
  }

  async getOfSeller(sellerId: string, id: string): Promise<SellerOrderDto> {
    const sellerOrder = await this.orders.findSellerOrderOf(id, sellerId);
    if (sellerOrder === null) {
      throw new SellerOrderNotFoundError();
    }
    return SellerOrderDto.from(sellerOrder, await this.sellers.findStoreNames([sellerId]));
  }

  /** How many of the store's seller orders placed in the period are in each status. */
  async countOfSellerByStatus(
    sellerId: string,
    period: { from: string; to: string },
    timeZone: string,
  ): Promise<Record<SellerOrderStatusValue, number>> {
    const counts = await this.orders.countSellerOrdersByStatus(sellerId, period, timeZone);
    return {
      NEW: counts.get('NEW') ?? 0,
      PROCESSING: counts.get('PROCESSING') ?? 0,
      SHIPPED: counts.get('SHIPPED') ?? 0,
      COMPLETED: counts.get('COMPLETED') ?? 0,
      CANCELLED: counts.get('CANCELLED') ?? 0,
    };
  }

  /** Any seller order, for admin flows. */
  async getAnySellerOrder(id: string): Promise<SellerOrderDto> {
    const sellerOrder = await this.orders.findSellerOrder(id);
    if (sellerOrder === null) {
      throw new SellerOrderNotFoundError();
    }
    return SellerOrderDto.from(
      sellerOrder,
      await this.sellers.findStoreNames([sellerOrder.sellerId]),
    );
  }

  /** The item that entitles the customer to review the product: bought and completed (I-11). */
  findCompletedItemId(customerId: string, productId: string): Promise<string | null> {
    return this.orders.findCompletedItemId(customerId, productId);
  }

  private async page(
    { items, total }: { items: OrderRecord[]; total: number },
    page: number,
    limit: number,
  ): Promise<OrderPageDto> {
    const names = await this.sellers.findStoreNames([
      ...new Set(items.flatMap((order) => order.sellerOrders.map((so) => so.sellerId))),
    ]);
    return { items: items.map((order) => OrderResponseDto.from(order, names)), total, page, limit };
  }

  private async toOrderResponse(order: OrderRecord): Promise<OrderResponseDto> {
    const names = await this.sellers.findStoreNames(
      order.sellerOrders.map((sellerOrder) => sellerOrder.sellerId),
    );
    return OrderResponseDto.from(order, names);
  }
}
