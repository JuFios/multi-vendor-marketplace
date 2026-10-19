import { ApiProperty } from '@nestjs/swagger';

import type { Notification } from '../notification';

export class NotificationResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ description: 'The event this notification reports, e.g. seller_order.created.' })
  type: string;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description:
      'Ids and new state from the event, plus the correlationId of the request behind it.',
  })
  payload: Record<string, unknown>;

  @ApiProperty({ format: 'date-time', nullable: true, type: String })
  readAt: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;

  static from(notification: Notification): NotificationResponseDto {
    return {
      id: notification.id,
      type: notification.type,
      payload: notification.payload as Record<string, unknown>,
      readAt: notification.readAt?.toISOString() ?? null,
      createdAt: notification.createdAt.toISOString(),
    };
  }
}

export class NotificationPageDto {
  @ApiProperty({ type: [NotificationResponseDto] })
  items: NotificationResponseDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;
}

export class UnreadCountDto {
  @ApiProperty()
  count: number;
}

export class ReadAllResultDto {
  @ApiProperty({ description: 'How many notifications were marked read.' })
  updated: number;
}
